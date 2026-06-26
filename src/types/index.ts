export type UserRole = "citizen" | "ward" | "dept" | "corp";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  points: number;
  badges: string[];
  createdAt: number;
}

export type IssueStatus = "Reported" | "Assigned" | "In Progress" | "Resolved" | "Escalated";
export type IssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IssueCategory =
  | "Road Damage" | "Water Leakage" | "Streetlight Failure"
  | "Waste Management" | "Traffic Issues" | "Public Safety"
  | "Drainage Problems" | "Encroachment";

export interface Issue {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: IssueStatus;
  department: string;
  priorityScore: number;
  imageBase64?: string;
  location: { lat: number; lng: number; address: string };
  reportedBy: string;
  reporterName: string;
  assignedTo?: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
  resolutionNote?: string;
  escalatedAt?: number;
  escalatedBy?: string;
  escalationNote?: string;
  corpNote?: string;
  verifications?: number;
  isMegaComplaint?: boolean;
  megaCount?: number;
  megaReporters?: string[];
}