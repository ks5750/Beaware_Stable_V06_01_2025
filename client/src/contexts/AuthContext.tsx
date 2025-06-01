import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api';
import { auth, signInWithGoogle, signOutUser, handleRedirectResult } from '@/lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { useLocation } from 'wouter';
import UsernameSelectionModal from '@/components/UsernameSelectionModal';

interface User {
  id: number;
  email: string;
  displayName: string;
  beawareUsername?: string;
  role: 'admin' | 'user' | 'lawyer';
  authProvider: 'local' | 'google';
  googleId?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  loginWithGoogle: () => Promise<void>;
}

// Create a constant to hold default values
const defaultAuthContext: AuthContextType = {
  user: null,
  isLoading: true,
  login: async () => { throw new Error('AuthContext not initialized'); },
  register: async () => { throw new Error('AuthContext not initialized'); },
  logout: () => { throw new Error('AuthContext not initialized'); },
  loginWithGoogle: async () => { throw new Error('AuthContext not initialized'); },
};

// Create context with default values
const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export function AuthProvider({ children }: { children: ReactNode | ((props: AuthContextType) => ReactNode) }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [pendingGoogleUser, setPendingGoogleUser] = useState<User | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Check if the user is logged in on mount and handle redirect
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('Checking authentication state...');
        
        // First check if there's a redirect result
        console.log('Handling potential redirect result...');
        const redirectResult = await handleRedirectResult();
        console.log('Redirect result:', redirectResult ? 'Found' : 'None');
        
        if (redirectResult && redirectResult.user) {
          // Handle successful redirect from Google
          const firebaseUser = redirectResult.user;
          console.log('Firebase user after redirect:', {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName
          });
          
          if (firebaseUser.email) {
            console.log('Google sign-in redirect successful, processing user...');
            
            try {
              // Process the Firebase user after redirect
              const userPayload = {
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
                googleId: firebaseUser.uid,
                authProvider: 'google',
              };
              console.log('Sending user data to backend:', userPayload);
              
              const response = await apiRequest(getApiUrl('auth/google-login'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(userPayload),
              });
              
              console.log('Backend response status:', response.status);
              const data = await response.json();
              console.log('Backend response data:', data);
              
              if (data.user) {
                console.log('Setting user in state:', data.user);
                setUser(data.user);
                
                // Save user to localStorage
                localStorage.setItem('user', JSON.stringify(data.user));
                
                toast({
                  title: 'Login Successful',
                  description: 'You have been logged in with Google',
                });
                
                // Check if user needs to select a BeAware username
                if (!data.user.beawareUsername) {
                  console.log('User needs to select BeAware username, showing modal');
                  setShowUsernameModal(true);
                } else {
                  console.log('User has BeAware username, redirecting to dashboard');
                  setLocation('/dashboard');
                }
              } else {
                console.error('Backend response contained no user data');
                toast({
                  title: 'Login Error',
                  description: 'Failed to retrieve user data from server',
                  variant: 'destructive',
                });
              }
            } catch (apiError) {
              console.error('API request error during Google login:', apiError);
              toast({
                title: 'Login Error',
                description: 'Failed to communicate with the server',
                variant: 'destructive',
              });
            }
            
            return; // Exit early if we handled the redirect
          }
        }
        
        // If no redirect result, try to get user info from localStorage
        console.log('No redirect result, checking localStorage...');
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            console.log('Found user in localStorage:', parsedUser);
            setUser(parsedUser);
          } catch (parseError) {
            console.error('Error parsing stored user:', parseError);
            localStorage.removeItem('user'); // Remove invalid data
          }
        } else {
          console.log('No user found in localStorage');
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        toast({
          title: 'Authentication Error',
          description: error instanceof Error ? error.message : 'Failed to process authentication',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [toast, setLocation]);

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await apiRequest(getApiUrl('auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      setUser(data.user);
      
      // Save user to localStorage
      localStorage.setItem('user', JSON.stringify(data.user));
      
      toast({
        title: 'Success',
        description: 'You are now logged in',
      });
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: 'Login Failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, displayName: string, beawareUsername?: string) => {
    try {
      setIsLoading(true);
      const response = await apiRequest(getApiUrl('auth/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email, 
          password, 
          displayName, // This will be mapped to display_name in the server
          beawareUsername,
          role: 'user',
          authProvider: 'local' 
        }),
      });

      const data = await response.json();
      
      // Auto-login on successful registration
      if (data.success && data.user) {
        setUser(data.user);
        // Save user to localStorage
        localStorage.setItem('user', JSON.stringify(data.user));
        
        toast({
          title: 'Registration Successful',
          description: 'You have been logged in automatically',
        });
      } else {
        toast({
          title: 'Registration Successful',
          description: 'You can now log in with your credentials',
        });
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: 'Registration Failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Sign out from Firebase
      await signOutUser();
      
      // Clear local user state
      setUser(null);
      localStorage.removeItem('user');
      
      toast({
        title: 'Logged Out',
        description: 'You have been logged out successfully',
      });
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        title: 'Logout Failed',
        description: 'There was a problem logging you out',
        variant: 'destructive',
      });
    }
  };

  const loginWithGoogle = async () => {
    try {
      setIsLoading(true);
      
      // This will always redirect to Google auth
      // We won't actually return from this function normally
      await signInWithGoogle();
      
      // The rest of the auth flow will be handled in handleRedirectResult
      // on the next page load after Google redirects back
      
      // If we somehow get here (which we shouldn't), log it
      console.log('Note: Google redirect did not happen as expected');
      
    } catch (error) {
      console.error('Google login error:', error);
      toast({
        title: 'Google Login Failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
    // We don't need a finally block because we're redirecting away
    // and the page will reload, at which point isLoading will be reset
  };

  // Listen for Firebase auth state changes
  useEffect(() => {
    console.log("Setting up Firebase auth state listener");
    
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      console.log("Firebase auth state changed:", firebaseUser ? `User: ${firebaseUser.email}` : "No user");
      
      // If Firebase has a user but we don't have a user in our app state
      if (firebaseUser) {
        // Skip if we're already processing the redirect result
        if (isLoading) {
          console.log("Already loading auth state, skipping auth state change handler");
          return;
        }
        
        // Check if we already have a user with the same ID to avoid duplicate logins
        const storedUserStr = localStorage.getItem('user');
        let storedUser = null;
        try {
          if (storedUserStr) {
            storedUser = JSON.parse(storedUserStr);
          }
        } catch (e) {
          console.error("Error parsing stored user:", e);
        }
        
        // If no stored user or different Google ID, process the login
        if (!storedUser || storedUser.googleId !== firebaseUser.uid) {
          console.log("Processing Firebase user auth state change");
          
          // This will handle silent sign-in after page refresh
          // when the user is already signed in with Google
          (async () => {
            try {
              setIsLoading(true);
              
              const email = firebaseUser.email;
              
              if (!email) {
                console.error('Firebase user has no email');
                setIsLoading(false);
                return;
              }
              
              console.log("Sending Firebase user to backend for authentication");
              const userPayload = {
                email: email,
                displayName: firebaseUser.displayName || email.split('@')[0],
                googleId: firebaseUser.uid,
                authProvider: 'google',
              };
              console.log("User payload:", userPayload);
              
              const response = await apiRequest(getApiUrl('auth/google-login'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(userPayload),
              });
              
              console.log("Backend response status:", response.status);
              const data = await response.json();
              console.log("Backend auth response:", data);
              
              if (data.user) {
                console.log("Setting authenticated user in app state:", data.user);
                setUser(data.user);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                // Check if user needs to set BeAware username
                if (data.needsUsername) {
                  console.log("User needs to set BeAware username, showing modal");
                  setPendingGoogleUser(data.user);
                  setShowUsernameModal(true);
                } else {
                  toast({
                    title: 'Authentication Successful',
                    description: 'You are now logged in with Google',
                  });
                  
                  // Redirect to dashboard
                  console.log('Redirecting to dashboard after Google login (auth state change)');
                  setLocation('/dashboard');
                }
              } else {
                console.error("Backend didn't return user data");
                toast({
                  title: 'Authentication Error',
                  description: 'Failed to retrieve user data',
                  variant: 'destructive',
                });
              }
            } catch (error) {
              console.error('Google login error during auth state change:', error);
              toast({
                title: 'Authentication Error',
                description: error instanceof Error ? error.message : 'Failed to process authentication',
                variant: 'destructive',
              });
            } finally {
              setIsLoading(false);
            }
          })();
        } else {
          console.log("User already authenticated with same Google ID, skipping");
          setIsLoading(false);
        }
      } else if (!firebaseUser && user?.authProvider === 'google') {
        // If Firebase has no user but we have a Google user in our app state,
        // this means the user has been signed out of Firebase
        console.log("User signed out of Firebase, clearing local auth state");
        setUser(null);
        localStorage.removeItem('user');
        setIsLoading(false);
      } else if (!firebaseUser) {
        // No Firebase user and no stored user - ensure loading is cleared
        setIsLoading(false);
      }
    });
    
    // Cleanup subscription
    return () => {
      console.log("Cleaning up Firebase auth state listener");
      unsubscribe();
    };
  }, [user, isLoading, toast, setLocation]);

  // Handler for when username is successfully set
  const handleUsernameSet = (username: string) => {
    console.log(`BeAware username set: ${username}`);
    
    if (pendingGoogleUser) {
      // Update the user object with the new username
      const updatedUser = { ...pendingGoogleUser, beawareUsername: username };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      // Clear pending state and close modal
      setPendingGoogleUser(null);
      setShowUsernameModal(false);
      
      toast({
        title: 'Welcome to BeAware!',
        description: `Your BeAware username "${username}" has been set successfully.`,
      });
      
      // Redirect to dashboard
      console.log('Redirecting to dashboard after username selection');
      setLocation('/dashboard');
    }
  };

  const authContextValue: AuthContextType = {
    user,
    isLoading,
    login,
    register,
    logout,
    loginWithGoogle,
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {typeof children === 'function' ? children(authContextValue) : children}
      <UsernameSelectionModal
        isOpen={showUsernameModal}
        onComplete={handleUsernameSet}
        userEmail={user?.email || ''}
      />
    </AuthContext.Provider>
  );
}

// Export the useAuth hook that handles the context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}