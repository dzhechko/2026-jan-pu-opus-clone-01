export type TeamRole = 'owner' | 'admin' | 'member';

export type TeamMember = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: TeamRole;
  joinedAt: Date;
};

export type TeamInvite = {
  id: string;
  email: string;
  role: TeamRole;
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: Date;
  createdAt: Date;
};

export type Team = {
  id: string;
  name: string;
  ownerId: string;
  members: TeamMember[];
  invites: TeamInvite[];
};
