/**
 * Token Store
 *
 * A simple in-memory store for the access token that can be accessed
 * from both React components and non-React code (like API utilities).
 *
 * Security: This store only holds the short-lived access token in memory.
 * The long-lived refresh token is stored in an httpOnly cookie that
 * JavaScript cannot access, protecting against XSS attacks.
 */

type TokenChangeListener = (token: string | null) => void;

class TokenStore {
  private accessToken: string | null = null;
  private listeners: Set<TokenChangeListener> = new Set();

  /**
   * Get the current access token
   */
  getToken(): string | null {
    return this.accessToken;
  }

  /**
   * Set the access token
   * Called by AuthContext when token changes
   */
  setToken(token: string | null): void {
    this.accessToken = token;
    this.notifyListeners();
  }

  /**
   * Subscribe to token changes
   */
  subscribe(listener: TokenChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of token change
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.accessToken);
      } catch (error) {
        console.error('Token listener error:', error);
      }
    });
  }

  /**
   * Clear the token (for logout)
   */
  clear(): void {
    this.accessToken = null;
    this.notifyListeners();
  }
}

// Singleton instance
export const tokenStore = new TokenStore();

/**
 * Get the current access token
 * Convenience function for use in API utilities
 */
export const getAccessToken = (): string | null => {
  return tokenStore.getToken();
};

/**
 * Set the access token
 * Called by AuthContext when token changes
 */
export const setAccessToken = (token: string | null): void => {
  tokenStore.setToken(token);
};

/**
 * Clear the access token
 * Called on logout
 */
export const clearAccessToken = (): void => {
  tokenStore.clear();
};
