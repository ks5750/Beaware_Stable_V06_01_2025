import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { signInWithGoogle, handleRedirectResult, auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { logAuthDiagnostics } from "@/lib/auth-config";

export default function GoogleLoginTest() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [localStorageData, setLocalStorageData] = useState<any>(null);
  const { toast } = useToast();

  // Check for existing auth state on mount
  useEffect(() => {
    // Log auth environment data
    const diagnostics = logAuthDiagnostics();
    setResult(`Environment detection:\n${JSON.stringify(diagnostics, null, 2)}`);
    
    // Check for current Firebase user
    const currentUser = auth.currentUser;
    if (currentUser) {
      setFirebaseUser({
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName,
        authProvider: currentUser.providerData[0]?.providerId || 'unknown'
      });
    }
    
    // Check localStorage for saved user data
    try {
      const savedUser = localStorage.getItem('authUser');
      const savedBeAwareUser = localStorage.getItem('user');
      if (savedUser) {
        setLocalStorageData({
          authUser: JSON.parse(savedUser),
          beAwareUser: savedBeAwareUser ? JSON.parse(savedBeAwareUser) : null
        });
      }
    } catch (err) {
      console.error('Error checking localStorage:', err);
    }
    
    // Check if we're waiting for a redirect
    const awaitingRedirect = localStorage.getItem('awaitingGoogleRedirect');
    if (awaitingRedirect === 'true') {
      setResult(prev => `${prev}\n\nWaiting for redirect completion. Checking...`);
      handleRedirectCheck();
    }
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      setResult("Starting Google login process...");
      
      // Try signInWithGoogle
      setResult(prev => `${prev}\nAttempting sign in with Google...`);
      const signInResult = await signInWithGoogle();
      
      if (signInResult) {
        setResult(prev => `${prev}\nSign in successful! User: ${signInResult.user.email}`);
        setFirebaseUser({
          uid: signInResult.user.uid,
          email: signInResult.user.email,
          displayName: signInResult.user.displayName,
          authProvider: signInResult.user.providerData[0]?.providerId || 'unknown'
        });
        
        toast({
          title: "Google Sign-In Success",
          description: `Signed in as ${signInResult.user.email}`,
        });
        
        // Update localStorage display
        try {
          const savedUser = localStorage.getItem('authUser');
          const savedBeAwareUser = localStorage.getItem('user');
          if (savedUser) {
            setLocalStorageData({
              authUser: JSON.parse(savedUser),
              beAwareUser: savedBeAwareUser ? JSON.parse(savedBeAwareUser) : null
            });
          }
        } catch (err) {
          console.error('Error checking localStorage:', err);
        }
      } else {
        // If signInWithGoogle returned null, it might have redirected
        setResult(prev => `${prev}\nNo immediate result - possible redirect initiated.`);
        setResult(prev => `${prev}\nCheck the popup window or return to this tab after authentication.`);
      }
    } catch (error) {
      console.error("Google login error:", error);
      setResult(prev => `${prev}\nError: ${error instanceof Error ? error.message : String(error)}`);
      
      // Add more detailed error info if available
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as any).code;
        setResult(prev => `${prev}\nError code: ${errorCode}`);
        setResult(prev => `${prev}\nSee console for more details.`);
      }
      
      toast({
        title: "Google Sign-In Failed",
        description: error instanceof Error ? error.message : "An error occurred during sign in",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedirectCheck = async () => {
    try {
      setIsLoading(true);
      setResult(prev => prev ? `${prev}\n\nChecking for redirect result...` : "Checking for redirect result...");
      
      const redirectResult = await handleRedirectResult();
      
      if (redirectResult) {
        setResult(prev => `${prev}\nRedirect result found! User: ${redirectResult.user.email}`);
        setFirebaseUser({
          uid: redirectResult.user.uid,
          email: redirectResult.user.email,
          displayName: redirectResult.user.displayName,
          authProvider: redirectResult.user.providerData[0]?.providerId || 'unknown'
        });
        
        toast({
          title: "Google Sign-In Success (Redirect)",
          description: `Signed in as ${redirectResult.user.email}`,
        });
        
        // Update localStorage display
        try {
          const savedUser = localStorage.getItem('authUser');
          const savedBeAwareUser = localStorage.getItem('user');
          if (savedUser) {
            setLocalStorageData({
              authUser: JSON.parse(savedUser),
              beAwareUser: savedBeAwareUser ? JSON.parse(savedBeAwareUser) : null
            });
          }
        } catch (err) {
          console.error('Error checking localStorage:', err);
        }
      } else {
        setResult(prev => `${prev}\nNo redirect result found.`);
        
        // Check if user is now logged in anyway
        const currentUser = auth.currentUser;
        if (currentUser) {
          setResult(prev => `${prev}\nHowever, a user is currently signed in with Firebase: ${currentUser.email}`);
          setFirebaseUser({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            authProvider: currentUser.providerData[0]?.providerId || 'unknown'
          });
        }
      }
    } catch (error) {
      console.error("Error checking redirect:", error);
      setResult(prev => `${prev}\nError checking redirect: ${error instanceof Error ? error.message : String(error)}`);
      
      // Add more detailed error info if available
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as any).code;
        setResult(prev => `${prev}\nError code: ${errorCode}`);
      }
      
      toast({
        title: "Redirect Check Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearStorage = () => {
    try {
      localStorage.removeItem('authUser');
      localStorage.removeItem('awaitingGoogleRedirect');
      localStorage.removeItem('user');
      setLocalStorageData(null);
      setResult(prev => `${prev}\n\nLocal storage cleared.`);
      
      toast({
        title: "Storage Cleared",
        description: "Local storage data has been cleared",
      });
    } catch (err) {
      console.error('Error clearing localStorage:', err);
      toast({
        title: "Error",
        description: "Failed to clear local storage",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Google Login Test</h2>
      
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Actions</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button 
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              {isLoading ? "Loading..." : "Sign in with Google"}
            </Button>
            
            <Button 
              onClick={handleRedirectCheck}
              disabled={isLoading}
              className="bg-green-500 hover:bg-green-600 text-white"
            >
              {isLoading ? "Loading..." : "Check Redirect Result"}
            </Button>

            <Button 
              onClick={clearStorage}
              disabled={isLoading}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Clear Local Storage
            </Button>
          </div>
        </div>
        
        {/* Current Auth State */}
        <div className="border rounded-md p-4">
          <h3 className="text-lg font-semibold mb-2">Current Auth State</h3>
          
          {firebaseUser ? (
            <div className="text-sm space-y-1">
              <p><span className="font-medium">Signed in as:</span> {firebaseUser.email}</p>
              <p><span className="font-medium">Display Name:</span> {firebaseUser.displayName}</p>
              <p><span className="font-medium">User ID:</span> {firebaseUser.uid}</p>
              <p><span className="font-medium">Provider:</span> {firebaseUser.authProvider}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not signed in with Firebase</p>
          )}
        </div>
        
        {/* Local Storage Data */}
        {localStorageData && (
          <div className="border rounded-md p-4">
            <h3 className="text-lg font-semibold mb-2">Local Storage Data</h3>
            <pre className="text-xs overflow-auto max-h-40 p-2 bg-gray-50 rounded">
              {JSON.stringify(localStorageData, null, 2)}
            </pre>
          </div>
        )}
        
        {/* Results Log */}
        {result && (
          <div className="border rounded-md p-4">
            <h3 className="text-lg font-semibold mb-2">Process Log</h3>
            <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-60 p-2 bg-gray-50 rounded">
              {result}
            </pre>
          </div>
        )}

        {/* Environment Info */}
        <div className="border rounded-md p-4">
          <h3 className="text-lg font-semibold mb-2">Environment Info</h3>
          <div className="text-xs space-y-1">
            <p><span className="font-medium">Current URL:</span> {window.location.href}</p>
            <p><span className="font-medium">Hostname:</span> {window.location.hostname}</p>
            <p><span className="font-medium">Port:</span> {window.location.port || "default"}</p>
            <p><span className="font-medium">Protocol:</span> {window.location.protocol}</p>
            <p><span className="font-medium">In iframe:</span> {window !== window.parent ? "Yes" : "No"}</p>
            <p><span className="font-medium">User Agent:</span> {navigator.userAgent}</p>
          </div>
        </div>
      </div>
    </div>
  );
}