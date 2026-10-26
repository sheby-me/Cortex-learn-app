/**
 * Helper utilities for formatting and validating authentication errors
 */

export function formatAuthError(err: unknown): string {
  if (!err) return "An unknown error occurred. Please try again.";

  if (typeof err === "string") {
    return cleanRawErrorMessage(err);
  }

  if (typeof err === "object") {
    const errorObj = err as Record<string, unknown>;
    const code = typeof errorObj.code === "string" ? errorObj.code : "";
    const message = typeof errorObj.message === "string" ? errorObj.message : "";

    // Specific Firebase Auth error codes
    switch (code) {
      case "auth/invalid-api-key":
      case "auth/api-key-not-valid":
        return "Firebase API Key is invalid or missing. If deployed on Vercel, make sure VITE_FIREBASE_API_KEY and other Firebase environment variables are set in your Vercel Project Settings.";

      case "auth/wrong-password":
      case "auth/user-not-found":
      case "auth/invalid-credential":
      case "auth/invalid-login-credentials":
        return "Incorrect email or password. Please check your details and try again.";

      case "auth/invalid-email":
        return "The email address is not valid. Please check for typos.";

      case "auth/email-already-in-use":
        return "An account with this email address already exists. Please sign in instead.";

      case "auth/weak-password":
        return "Password is too weak. Please use at least 8 characters with a mix of letters and numbers.";

      case "auth/too-many-requests":
        return "Access to this account has been temporarily disabled due to multiple failed login attempts. Please try again later or reset your password.";

      case "auth/user-disabled":
        return "This account has been disabled. Please contact support or an admin.";

      case "auth/popup-closed-by-user":
        return "Google sign-in popup was closed before completing.";

      case "auth/popup-blocked":
        return "Google sign-in popup was blocked by your browser. Please allow popups for this site.";

      case "auth/network-request-failed":
        return "Network connection failed. Please check your internet connection.";

      case "auth/operation-not-allowed":
        return "This sign-in method is currently disabled.";

      case "auth/requires-recent-login":
        return "Please log in again to perform this sensitive action.";

      case "auth/account-exists-with-different-credential":
        return "An account already exists with the same email address but different sign-in credentials.";
    }

    // Inspect error message text if code was generic or missing
    if (message) {
      if (
        message.includes("auth/invalid-api-key") ||
        message.includes("invalid-api-key") ||
        message.includes("API key")
      ) {
        return "Firebase API Key is invalid or missing. If deployed on Vercel, make sure VITE_FIREBASE_API_KEY and other Firebase environment variables are set in your Vercel Project Settings.";
      }
      if (
        message.includes("auth/invalid-credential") ||
        message.includes("auth/wrong-password") ||
        message.includes("auth/user-not-found") ||
        message.includes("INVALID_LOGIN_CREDENTIALS")
      ) {
        return "Incorrect email or password. Please check your details and try again.";
      }
      if (message.includes("auth/email-already-in-use")) {
        return "An account with this email address already exists. Please sign in instead.";
      }
      if (message.includes("auth/weak-password")) {
        return "Password is too weak. Please use at least 8 characters.";
      }
      if (message.includes("auth/invalid-email")) {
        return "The email address is not valid. Please enter a valid email address.";
      }
      if (message.includes("auth/too-many-requests")) {
        return "Too many failed sign-in attempts. Please wait a moment before trying again.";
      }
      return cleanRawErrorMessage(message);
    }
  }

  return "An unexpected error occurred. Please try again.";
}

function cleanRawErrorMessage(msg: string): string {
  return msg
    .replace(/^Firebase:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/\s*\(auth\/[^)]+\)\.?$/i, "")
    .trim();
}

export interface AuthValidationResult {
  valid: boolean;
  error?: string;
}

export function validateSignIn(email: string, password: string): AuthValidationResult {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return { valid: false, error: "Please enter your email address." };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { valid: false, error: "Please enter a valid email address (e.g. user@example.com)." };
  }
  if (!password) {
    return { valid: false, error: "Please enter your password." };
  }
  return { valid: true };
}

export function validateSignUp(params: {
  email: string;
  password: string;
  name?: string;
  role: "student" | "tutor" | "admin";
  credentials?: string;
  bio?: string;
}): AuthValidationResult {
  const trimmedEmail = params.email.trim();
  if (!trimmedEmail) {
    return { valid: false, error: "Please enter your email address." };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { valid: false, error: "Please enter a valid email address (e.g. user@example.com)." };
  }

  if (params.name !== undefined && !params.name.trim()) {
    return { valid: false, error: "Please enter your full name." };
  }

  if (!params.password) {
    return { valid: false, error: "Please choose a password." };
  }
  if (params.password.length < 8) {
    return {
      valid: false,
      error: `Password must be at least 8 characters long (currently ${params.password.length} characters).`,
    };
  }

  if (params.role === "tutor") {
    if (params.credentials !== undefined && !params.credentials.trim()) {
      return { valid: false, error: "Please provide your academic or tutoring credentials." };
    }
    if (params.bio !== undefined && !params.bio.trim()) {
      return { valid: false, error: "Please provide a short bio explaining what you teach." };
    }
  }

  return { valid: true };
}
