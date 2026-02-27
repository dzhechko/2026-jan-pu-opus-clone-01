import { z } from 'zod';
import { randomUUID } from 'crypto';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { sendEmail, teamInviteEmail } from '@/lib/auth/email';
import { PLANS } from '@clipmaker/types';
import type { PlanId } from '@clipmaker/types';

export const teamRouter = router({
  /** Get user's current team with members and invites */
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { teamId: true, planId: true },
    });

    if (!user?.teamId) return null;

    const team = await ctx.prisma.team.findUnique({
      where: { id: user.teamId },
      include: {
        teamMembers: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        invites: {
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!team) return null;

    return {
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      members: team.teamMembers.map((m) => ({
        id: m.id,
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      invites: team.invites.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
    };
  }),

  /** Create a new team */
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await checkRateLimit('team:create', userId, 5, 3600);

      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { teamId: true, planId: true },
      });

      if (user?.teamId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Вы уже состоите в команде. Покиньте текущую, чтобы создать новую.',
        });
      }

      const planId = (user?.planId ?? 'free') as PlanId;
      if (PLANS[planId].maxTeamSeats <= 1) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Командная работа недоступна на вашем тарифе. Обновите до Pro или Business.',
        });
      }

      const team = await ctx.prisma.$transaction(async (tx) => {
        const newTeam = await tx.team.create({
          data: { name: input.name, ownerId: userId },
        });

        await tx.teamMember.create({
          data: {
            teamId: newTeam.id,
            userId,
            role: 'owner',
          },
        });

        await tx.user.update({
          where: { id: userId },
          data: { teamId: newTeam.id },
        });

        return newTeam;
      });

      return { id: team.id, name: team.name };
    }),

  /** Invite a member by email */
  invite: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(['admin', 'member']).default('member'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await checkRateLimit('team:invite', userId, 20, 3600);

      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { teamId: true, planId: true },
      });

      if (!user?.teamId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'У вас нет команды' });
      }

      // Check caller is owner or admin
      const membership = await ctx.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: user.teamId, userId } },
      });

      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Только владелец или администратор может приглашать участников',
        });
      }

      // Check team seat limit
      const planId = (user.planId ?? 'free') as PlanId;
      const maxSeats = PLANS[planId].maxTeamSeats;
      const currentMembers = await ctx.prisma.teamMember.count({
        where: { teamId: user.teamId },
      });
      const pendingInvites = await ctx.prisma.teamInvite.count({
        where: { teamId: user.teamId, status: 'pending' },
      });

      if (currentMembers + pendingInvites >= maxSeats) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Достигнут лимит участников (${maxSeats}). Обновите тариф.`,
        });
      }

      // Check if already a member
      const normalizedEmail = input.email.toLowerCase().trim();
      const existingUser = await ctx.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (existingUser) {
        const alreadyMember = await ctx.prisma.teamMember.findUnique({
          where: {
            teamId_userId: { teamId: user.teamId, userId: existingUser.id },
          },
        });
        if (alreadyMember) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Пользователь уже в команде',
          });
        }
      }

      // Check for existing pending invite
      const existingInvite = await ctx.prisma.teamInvite.findFirst({
        where: {
          teamId: user.teamId,
          email: normalizedEmail,
          status: 'pending',
        },
      });

      if (existingInvite) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Приглашение уже отправлено на этот email',
        });
      }

      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invite = await ctx.prisma.teamInvite.create({
        data: {
          teamId: user.teamId,
          email: normalizedEmail,
          token,
          role: input.role,
          expiresAt,
        },
      });

      // Send invite email
      const team = await ctx.prisma.team.findUnique({
        where: { id: user.teamId },
        select: { name: true },
      });
      const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
      const inviteLink = `${baseUrl}/invite?token=${token}`;
      await sendEmail(teamInviteEmail(normalizedEmail, team?.name ?? 'Команда', inviteLink));

      return {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      };
    }),

  /** Accept an invite by token */
  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const invite = await ctx.prisma.teamInvite.findUnique({
        where: { token: input.token },
        include: { team: { select: { name: true } } },
      });

      if (!invite || invite.status !== 'pending') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Приглашение не найдено или уже использовано' });
      }

      if (invite.expiresAt < new Date()) {
        await ctx.prisma.teamInvite.update({
          where: { id: invite.id },
          data: { status: 'expired' },
        });
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Приглашение истекло' });
      }

      // Check user email matches invite
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, teamId: true },
      });

      if (user?.email !== invite.email) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Приглашение адресовано другому email',
        });
      }

      if (user.teamId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Вы уже состоите в команде. Покиньте текущую, чтобы принять приглашение.',
        });
      }

      await ctx.prisma.$transaction([
        ctx.prisma.teamInvite.update({
          where: { id: invite.id },
          data: { status: 'accepted' },
        }),
        ctx.prisma.teamMember.create({
          data: {
            teamId: invite.teamId,
            userId,
            role: invite.role,
          },
        }),
        ctx.prisma.user.update({
          where: { id: userId },
          data: { teamId: invite.teamId },
        }),
      ]);

      return { teamId: invite.teamId, teamName: invite.team.name };
    }),

  /** Remove a member */
  removeMember: protectedProcedure
    .input(z.object({ memberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { teamId: true },
      });

      if (!user?.teamId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'У вас нет команды' });
      }

      // Check caller is owner or admin
      const callerMembership = await ctx.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: user.teamId, userId } },
      });

      if (!callerMembership || (callerMembership.role !== 'owner' && callerMembership.role !== 'admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Только владелец или администратор может удалять участников',
        });
      }

      const target = await ctx.prisma.teamMember.findUnique({
        where: { id: input.memberId },
        select: { userId: true, role: true, teamId: true },
      });

      if (!target || target.teamId !== user.teamId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Участник не найден' });
      }

      if (target.role === 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Нельзя удалить владельца команды',
        });
      }

      // Admin can only remove members, not other admins
      if (callerMembership.role === 'admin' && target.role === 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Администратор не может удалить другого администратора',
        });
      }

      await ctx.prisma.$transaction([
        ctx.prisma.teamMember.delete({ where: { id: input.memberId } }),
        ctx.prisma.user.update({
          where: { id: target.userId },
          data: { teamId: null },
        }),
      ]);

      return { removed: true };
    }),

  /** Update a member's role */
  updateRole: protectedProcedure
    .input(
      z.object({
        memberId: z.string().uuid(),
        role: z.enum(['admin', 'member']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { teamId: true },
      });

      if (!user?.teamId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'У вас нет команды' });
      }

      // Only owner can change roles
      const callerMembership = await ctx.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: user.teamId, userId } },
      });

      if (!callerMembership || callerMembership.role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Только владелец может менять роли',
        });
      }

      const target = await ctx.prisma.teamMember.findUnique({
        where: { id: input.memberId },
        select: { role: true, teamId: true },
      });

      if (!target || target.teamId !== user.teamId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Участник не найден' });
      }

      if (target.role === 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Нельзя изменить роль владельца',
        });
      }

      await ctx.prisma.teamMember.update({
        where: { id: input.memberId },
        data: { role: input.role },
      });

      return { updated: true };
    }),

  /** Leave the team (non-owner) */
  leave: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const user = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { teamId: true },
    });

    if (!user?.teamId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Вы не состоите в команде' });
    }

    const membership = await ctx.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: user.teamId, userId } },
    });

    if (!membership) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Участник не найден' });
    }

    if (membership.role === 'owner') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Владелец не может покинуть команду. Передайте владение или удалите команду.',
      });
    }

    await ctx.prisma.$transaction([
      ctx.prisma.teamMember.delete({
        where: { teamId_userId: { teamId: user.teamId, userId } },
      }),
      ctx.prisma.user.update({
        where: { id: userId },
        data: { teamId: null },
      }),
    ]);

    return { left: true };
  }),

  /** Delete the team (owner only) */
  delete: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const user = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { teamId: true },
    });

    if (!user?.teamId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'У вас нет команды' });
    }

    const team = await ctx.prisma.team.findUnique({
      where: { id: user.teamId },
    });

    if (!team || team.ownerId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Только владелец может удалить команду',
      });
    }

    // Remove teamId from all team members, then delete team (cascade handles the rest)
    await ctx.prisma.$transaction([
      ctx.prisma.user.updateMany({
        where: { teamId: user.teamId },
        data: { teamId: null },
      }),
      ctx.prisma.video.updateMany({
        where: { teamId: user.teamId },
        data: { teamId: null },
      }),
      ctx.prisma.team.delete({ where: { id: user.teamId } }),
    ]);

    return { deleted: true };
  }),

  /** Cancel a pending invite */
  cancelInvite: protectedProcedure
    .input(z.object({ inviteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { teamId: true },
      });

      if (!user?.teamId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'У вас нет команды' });
      }

      const invite = await ctx.prisma.teamInvite.findUnique({
        where: { id: input.inviteId },
      });

      if (!invite || invite.teamId !== user.teamId || invite.status !== 'pending') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Приглашение не найдено' });
      }

      await ctx.prisma.teamInvite.delete({ where: { id: input.inviteId } });

      return { cancelled: true };
    }),
});
