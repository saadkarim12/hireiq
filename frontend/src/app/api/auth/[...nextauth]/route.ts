// src/app/api/auth/[...nextauth]/route.ts
import NextAuth, { NextAuthOptions } from 'next-auth'
import AzureADB2CProvider from 'next-auth/providers/azure-ad-b2c'

const authOptions: NextAuthOptions = {
  providers: [
    AzureADB2CProvider({
      tenantId: process.env.AZURE_AD_B2C_TENANT_ID!,
      clientId: process.env.AZURE_AD_B2C_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_B2C_CLIENT_SECRET!,
      primaryUserFlow: process.env.AZURE_AD_B2C_PRIMARY_USER_FLOW!,
      authorization: {
        params: {
          scope: `offline_access openid profile ${process.env.AZURE_AD_B2C_CLIENT_ID}`,
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist access token and role from Azure AD B2C
      if (account) {
        token.accessToken = account.access_token ?? ''
        token.refreshToken = account.refresh_token ?? ''
        token.expiresAt = account.expires_at ?? 0
      }
      // Extract custom claims from B2C token
      if (profile) {
        token.agencyId = (profile as Record<string, unknown>).extension_AgencyId as string
        token.role = (profile as Record<string, unknown>).extension_Role as string
        token.userId = (profile as Record<string, unknown>).sub as string
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.user.id = token.userId as string
      session.user.agencyId = token.agencyId as string
      session.user.role = token.role as string
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
