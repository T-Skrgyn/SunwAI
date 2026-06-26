import { collection, getDocs, query, orderBy, limit, updateDoc, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { AppUser } from "../types";

export const LEVELS = [
  { name: "Naya Nagrik",   icon: "🌱", color: "#10B981", min: 0,   max: 50  },
  { name: "Satark Nagrik", icon: "⚡", color: "#3B82F6", min: 50,  max: 150 },
  { name: "Civic Leader",  icon: "🦁", color: "#8B5CF6", min: 150, max: 300 },
  { name: "Ward Champion", icon: "👑", color: "#F59E0B", min: 300, max: Infinity },
];

export const ALL_BADGES = [
  { id: "first_report",    label: "First Reporter",        icon: "🌟", desc: "Reported your first issue",           points: 0   },
  { id: "civic_champion",  label: "Civic Champion",        icon: "🏆", desc: "Earned 50 points",                   points: 50  },
  { id: "community_hero",  label: "Community Hero",        icon: "🦸", desc: "Earned 100 points",                  points: 100 },
  { id: "issue_expert",    label: "Issue Expert",          icon: "🎯", desc: "Earned 200 points",                  points: 200 },
  { id: "early_bird",      label: "Early Bird",            icon: "🐦", desc: "First to report in your area",        points: -1  },
  { id: "speed_verifier",  label: "Speed Verifier",        icon: "⚡", desc: "Verified 5 issues in 1 hour",         points: -1  },
  { id: "city_guardian",   label: "City Guardian",         icon: "🛡️", desc: "Reported 10+ different categories",   points: -1  },
  { id: "problem_solver",  label: "Problem Solver",        icon: "✅", desc: "Your report resolved within 24 hours", points: -1  },
];

export function getLevel(points: number) {
  const level = LEVELS.findLast(l => points >= l.min) || LEVELS[0];
  const next = LEVELS.find(l => l.min > points);
  const progress = next
    ? Math.round(((points - level.min) / (next.min - level.min)) * 100)
    : 100;
  return { ...level, next, progress };
}

export async function checkAndAwardBadges(uid: string, issues: any[]) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;
  const user = userSnap.data() as AppUser;
  const earned = new Set(user.badges || []);
  const toAdd: string[] = [];

  // First report
  if (issues.length >= 1 && !earned.has("first_report")) toAdd.push("first_report");

  // City guardian — 10+ different categories
  const cats = new Set(issues.map(i => i.category));
  if (cats.size >= 10 && !earned.has("city_guardian")) toAdd.push("city_guardian");

  // Problem solver — any report resolved within 24hrs
  const quickResolve = issues.some(i =>
    i.status === "Resolved" && i.resolvedAt && (i.resolvedAt - i.createdAt) < 86400000
  );
  if (quickResolve && !earned.has("problem_solver")) toAdd.push("problem_solver");

  if (toAdd.length > 0) {
    await updateDoc(userRef, { badges: [...earned, ...toAdd] });
  }
  return toAdd;
}

export async function checkStreak(uid: string): Promise<{ streak: number; bonusAwarded: boolean }> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return { streak: 0, bonusAwarded: false };
  const data = userSnap.data();

  const today = new Date().toDateString();
  const lastReport = data.lastReportDate || "";
  const streak = data.streak || 0;

  if (lastReport === today) return { streak, bonusAwarded: false };

  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const newStreak = lastReport === yesterday ? streak + 1 : 1;
  const bonusAwarded = newStreak > 0 && newStreak % 3 === 0;

  await updateDoc(userRef, {
    lastReportDate: today,
    streak: newStreak,
    ...(bonusAwarded ? { points: (data.points || 0) + 25 } : {}),
  });

  return { streak: newStreak, bonusAwarded };
}

export async function getLeaderboard() {
  const snap = await getDocs(
    query(collection(db, "users"), orderBy("points", "desc"), limit(10))
  );
  return snap.docs.map((d, i) => ({ rank: i + 1, ...d.data() as AppUser }));
}

export async function getDailyMissions(uid: string, issues: any[]) {
  const today = new Date().toDateString();
  const key = `missions_${uid}_${today}`;
  const cached = localStorage.getItem(key);
  if (cached) return JSON.parse(cached);

 
  const openCount = issues.filter(i => i.status !== "Resolved").length;

  const missions = [
    {
      id: "report_today",
      label: "Report an issue with photo",
      icon: "📷",
      pts: 10,
      completed: issues.some(i => new Date(i.createdAt).toDateString() === today),
    },
    {
      id: "verify_today",
      label: "Verify 2 nearby issues",
      icon: "✅",
      pts: 15,
      completed: false,
    },
    {
      id: "check_status",
      label: "Check status of your open reports",
      icon: "🔍",
      pts: 5,
      completed: openCount > 0,
    },
  ];

  localStorage.setItem(key, JSON.stringify(missions));
  return missions;
}