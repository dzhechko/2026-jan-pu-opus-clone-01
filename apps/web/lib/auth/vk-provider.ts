import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers/oauth';

type VkProfile = {
  response: Array<{
    id: number;
    first_name: string;
    last_name: string;
    photo_200: string;
  }>;
  email?: string;
};

type VkProviderUser = {
  id: string;
  name: string;
  email: string | undefined;
  image: string;
  vkId: string;
};

/**
 * Custom VK OAuth provider for NextAuth.js v4.
 *
 * Uses VK OAuth 2.0 endpoints. Requests only the "profile" scope
 * (video/wall scopes are for publishing, not authentication).
 */
export function VkProvider(
  options: OAuthUserConfig<VkProfile>,
): OAuthConfig<VkProfile> {
  return {
    id: 'vk',
    name: 'VK',
    type: 'oauth',
    authorization: {
      url: 'https://oauth.vk.com/authorize',
      params: {
        scope: 'email',
        v: '5.131',
      },
    },
    token: {
      url: 'https://oauth.vk.com/access_token',
    },
    userinfo: {
      url: 'https://api.vk.com/method/users.get',
      params: {
        fields: 'photo_200',
        v: '5.131',
      },
    },
    profile(profile): VkProviderUser {
      const user = profile.response[0];

      if (!user) {
        throw new Error('VK profile response is empty');
      }

      return {
        id: String(user.id),
        name: `${user.first_name} ${user.last_name}`,
        email: profile.email,
        image: user.photo_200,
        vkId: String(user.id),
      };
    },
    ...options,
  };
}
