import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      planId: string;
    } & NonNullable<DefaultSession['user']>;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    planId: string;
  }
}
