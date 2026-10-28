export type UserRole = "customer" | "professional" | "admin";

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  sessionId: string;
  assignedBookingIds?: string[];
}

