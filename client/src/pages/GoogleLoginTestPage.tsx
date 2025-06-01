import GoogleLoginTest from "@/components/GoogleLoginTest";

export default function GoogleLoginTestPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Google Login Test Page</h1>
      <p className="mb-8 text-gray-600">
        This page allows testing the Google Sign-in functionality outside of the normal application flow.
        It isolates the Firebase authentication process to help debug any issues.
      </p>
      
      <div className="max-w-md mx-auto">
        <GoogleLoginTest />
      </div>
    </div>
  );
}