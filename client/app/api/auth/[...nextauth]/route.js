import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { expressFetch } from '@/lib/api';

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'dummy_id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy_secret',
    }),
    CredentialsProvider({
      id: 'demo-login',
      name: 'Demo Account',
      credentials: {},
      async authorize() {
        return {
          id: 'google_demo_101',
          name: 'Vedant Bhakare (Demo)',
          email: 'vedant.demo@example.com',
          image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Vedant',
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user, account }) {
      const googleId = account?.providerAccountId || user.id;
      if (!googleId || !user.email) return false;
      const syncedUser = await expressFetch('/api/users/sync', {
        method: 'POST',
        body: { googleId, email: user.email, name: user.name, avatar: user.image },
      });
      if (!syncedUser?.id) throw new Error('User sync response did not contain a database ID');
      user.mongoId = String(syncedUser.id);
      return true;
    },
    async jwt({ token, user }) {
      if (user?.mongoId) {
        token.userId = user.mongoId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.userId) session.user.id = String(token.userId);
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'super-secret-chronogit-session-key-random-12345',
  pages: {
    signIn: '/',
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
