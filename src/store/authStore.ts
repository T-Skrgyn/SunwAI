import { create } from "zustand";
import type { AppUser, UserRole } from "../types";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";
import { auth, googleProvider, db } from "../lib/firebase";

interface AuthState {
  user: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setRole: (role: UserRole) => Promise<void>;
  addPoints: (pts: number) => Promise<void>;
  init: () => void;
}

const AUTHORITY_EMAILS: Record<string, UserRole> = {
  "ward@sunwai.com": "ward",
  "municipalco@sunwai.com": "corp",
  "departmentofficer@sunwai.com": "dept",
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  firebaseUser: null,
  loading: true,

  init: () => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const ref = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          set({ user: snap.data() as AppUser, firebaseUser, loading: false });
        } else {
          // auto-assign role for authority emails
          const role = AUTHORITY_EMAILS[firebaseUser.email || ""];
          if (role) {
            const newUser: AppUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email!,
              displayName: firebaseUser.displayName || firebaseUser.email!.split("@")[0],
              photoURL: "",
              role,
              points: 0,
              badges: [],
              createdAt: Date.now(),
            };
            await setDoc(ref, newUser);
            set({ user: newUser, firebaseUser, loading: false });
          } else {
            set({ firebaseUser, loading: false, user: null });
          }
        }
      } else {
        set({ user: null, firebaseUser: null, loading: false });
      }
    });
  },

  login: async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const fu = result.user;
    const ref = doc(db, "users", fu.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      set({ user: snap.data() as AppUser, firebaseUser: fu });
    } else {
      set({ firebaseUser: fu, user: null });
    }
  },

  loginWithEmail: async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const fu = result.user;
    const ref = doc(db, "users", fu.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      set({ user: snap.data() as AppUser, firebaseUser: fu });
    } else {
      const role = AUTHORITY_EMAILS[email];
      if (role) {
        const newUser: AppUser = {
          uid: fu.uid,
          email: fu.email!,
          displayName: fu.displayName || email.split("@")[0],
          photoURL: "",
          role,
          points: 0,
          badges: [],
          createdAt: Date.now(),
        };
        await setDoc(ref, newUser);
        set({ user: newUser, firebaseUser: fu });
      } else {
        set({ firebaseUser: fu, user: null });
      }
    }
  },

  register: async (name: string, email: string, password: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const fu = result.user;
    await updateProfile(fu, { displayName: name });
    const newUser: AppUser = {
      uid: fu.uid,
      email: fu.email!,
      displayName: name,
      photoURL: "",
      role: "citizen",
      points: 0,
      badges: [],
      createdAt: Date.now(),
    };
    await setDoc(doc(db, "users", fu.uid), newUser);
    set({ user: newUser, firebaseUser: fu });
  },

  setRole: async (role: UserRole) => {
    const { firebaseUser } = get();
    if (!firebaseUser) return;
    const newUser: AppUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email!,
      displayName: firebaseUser.displayName!,
      photoURL: firebaseUser.photoURL || "",
      role,
      points: 0,
      badges: [],
      createdAt: Date.now(),
    };
    await setDoc(doc(db, "users", firebaseUser.uid), newUser);
    set({ user: newUser });
  },

  addPoints: async (pts: number) => {
    const { user } = get();
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid), { points: increment(pts) });
    set({ user: { ...user, points: user.points + pts } });
  },

  logout: async () => {
    await signOut(auth);
    set({ user: null, firebaseUser: null });
  },
}));