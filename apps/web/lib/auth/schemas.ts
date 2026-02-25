import { z } from 'zod';

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Имя обязательно')
      .max(100, 'Имя не должно превышать 100 символов'),
    email: z
      .string()
      .min(1, 'Email обязателен')
      .email('Некорректный формат email'),
    password: z
      .string()
      .min(8, 'Пароль должен содержать минимум 8 символов')
      .max(128, 'Пароль не должен превышать 128 символов'),
    confirmPassword: z.string().min(1, 'Подтверждение пароля обязательно'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email обязателен')
    .email('Некорректный формат email'),
  password: z.string().min(1, 'Пароль обязателен'),
  rememberMe: z.boolean().default(false),
});

export const resetPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email обязателен')
    .email('Некорректный формат email'),
});

export const newPasswordSchema = z
  .object({
    token: z.string().min(1, 'Токен обязателен'),
    password: z
      .string()
      .min(8, 'Пароль должен содержать минимум 8 символов')
      .max(128, 'Пароль не должен превышать 128 символов'),
    confirmPassword: z.string().min(1, 'Подтверждение пароля обязательно'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
