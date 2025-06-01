import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ShieldIcon } from 'lucide-react';

export default function AdminLinkTest() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] gap-8">
      <div className="text-center space-y-4">
        <ShieldIcon className="h-16 w-16 mx-auto text-primary" />
        <h1 className="text-3xl font-bold">Admin Access Test</h1>
        <p className="text-lg text-muted-foreground">
          Please click the button below to try accessing the admin panel directly
        </p>
      </div>

      <div className="flex flex-col space-y-4 w-full max-w-xs">
        <Button asChild size="lg">
          <Link href="/admin">
            Go to Admin Panel
          </Link>
        </Button>
        
        <div className="text-center text-sm text-muted-foreground">
          <p>Make sure you're logged in as admin@scamreport.com</p>
        </div>
      </div>
    </div>
  );
}