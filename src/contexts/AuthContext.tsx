import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';

interface UserData {
  uid: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  createdAt?: string;
}

interface AuthContextType {
  user: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  fetchApi: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          let userDoc;
          try {
            userDoc = await getDoc(userDocRef);
          } catch (error) {
            setLoading(false);
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            return;
          }
          
          if (userDoc.exists()) {
            const data = userDoc.data() as UserData;
            if (firebaseUser.email === 'huydoan04101999@gmail.com' && data.role !== 'admin') {
              try {
                // Auto-upgrade the default admin if they were created as 'user'
                const { updateDoc } = await import('firebase/firestore');
                await updateDoc(userDocRef, { role: 'admin' });
                data.role = 'admin';
              } catch (e) {
                console.error("Failed to auto-upgrade default admin:", e);
              }
            }
            setUserData(data);
          } else {
            // Create new user
            const isAdminEmail = firebaseUser.email === 'huydoan04101999@gmail.com';
            const newUserData: UserData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              username: firebaseUser.displayName || 'User',
              role: isAdminEmail ? 'admin' : 'user',
              status: 'active',
              createdAt: new Date().toISOString()
            };
            try {
              await setDoc(userDocRef, newUserData);
            } catch (error) {
              setLoading(false);
              handleFirestoreError(error, OperationType.CREATE, `users/${firebaseUser.uid}`);
              return;
            }
            setUserData(newUserData);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const fetchApi = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (user) {
      headers.set('x-user-id', user.uid);
    }
    if (userData) {
      headers.set('x-user-role', userData.role);
    }
    
    return fetch(url, {
      ...options,
      headers
    });
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, loginWithGoogle, logout, fetchApi }}>
      {children}
    </AuthContext.Provider>
  );
};
