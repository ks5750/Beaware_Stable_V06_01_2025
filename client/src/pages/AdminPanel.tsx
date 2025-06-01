import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Card, 
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  EyeIcon, 
  CheckIcon, 
  XIcon, 
  AlertCircleIcon,
  AlertTriangleIcon,
  FileIcon,
  Video
} from "lucide-react";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { ScamVideoManager } from "@/components/admin/ScamVideoManager";

// Types
interface User {
  id: number;
  displayName: string;
  email: string;
  beawareUsername: string;
}

interface ScamReport {
  id: number;
  userId: number;
  scamType: 'phone' | 'email' | 'business';
  scamPhoneNumber: string | null;
  scamEmail: string | null;
  scamBusinessName: string | null;
  incidentDate: string;
  location: string;
  description: string;
  // Proof document fields removed as file upload feature is disabled
  hasProofDocument: boolean;
  proofDocumentPath: string | null;
  proofDocumentType: string | null;
  reportedAt: string;
  isVerified: boolean;
  verifiedBy: number | null;
  verifiedAt: string | null;
  user?: User;
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState("pending");
  
  // Fetch scam reports
  const { data: pendingReports, isLoading: isPendingLoading } = useQuery({
    queryKey: ['/api/scam-reports?isVerified=false'],
    enabled: activeTab === "pending"
  });
  
  const { data: verifiedReports, isLoading: isVerifiedLoading } = useQuery({
    queryKey: ['/api/scam-reports?isVerified=true'],
    enabled: activeTab === "verified"
  });
  
  // Mutation for verifying reports
  const verifyMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const response = await fetch(`/api/scam-reports/${reportId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isVerified: true }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to verify report');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch both unverified and verified report lists
      queryClient.invalidateQueries({ queryKey: ['/api/scam-reports?isVerified=false'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scam-reports?isVerified=true'] });
      toast({
        title: "Report Verified",
        description: "The scam report has been verified successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Verification Failed",
        description: `An error occurred: ${error.toString()}`,
        variant: "destructive",
      });
    },
  });
  
  // Dialog state for verification confirmation
  const [reportToVerify, setReportToVerify] = useState<number | null>(null);
  
  const handleVerify = (reportId: number) => {
    // Instead of using a browser alert, we'll use our toast system
    setReportToVerify(reportId);
    
    toast({
      title: "Confirm Report Verification",
      description: (
        <div className="flex flex-col gap-2">
          <p>Are you sure you want to verify this report? This will make it publicly visible.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setReportToVerify(null)}>
              Cancel
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => {
                verifyMutation.mutate(reportId);
                setReportToVerify(null);
              }}
            >
              Verify
            </Button>
          </div>
        </div>
      ),
      duration: 10000, // 10 seconds to decide
    });
  };
  
  // Helper to get scam identifier based on type
  const getScamIdentifier = (report: ScamReport) => {
    switch (report.scamType) {
      case 'phone':
        return report.scamPhoneNumber;
      case 'email':
        return report.scamEmail;
      case 'business':
        return report.scamBusinessName;
      default:
        return 'Unknown';
    }
  };
  
  // Return component JSX
  return (
    <div className="container mx-auto py-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      
      <Tabs defaultValue="pending" onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="pending">Pending Reports</TabsTrigger>
          <TabsTrigger value="verified">Verified Reports</TabsTrigger>
          <TabsTrigger value="videos">
            <span className="flex items-center">
              <Video className="h-4 w-4 mr-1" /> Videos
            </span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="pending" className="mt-6">
          <h2 className="text-xl font-semibold mb-4">Pending Reports</h2>
          {isPendingLoading ? (
            <div className="text-center py-8">Loading pending reports...</div>
          ) : !pendingReports || !Array.isArray(pendingReports) || pendingReports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircleIcon className="h-12 w-12 mx-auto mb-2" />
              <p>No pending reports found</p>
              <p className="text-sm mt-2">All scam reports have been reviewed</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {pendingReports.map((report: ScamReport) => (
                <Card key={report.id} className="border-yellow-200">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>
                          <p className="text-sm text-muted-foreground">ID: #{report.id}</p>
                        </div>
                        <CardTitle className="flex items-center gap-2">
                          <Badge variant="outline">{report.scamType}</Badge>
                          {getScamIdentifier(report)}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Reported on {format(new Date(report.reportedAt), 'MMM d, yyyy')} by {report.user?.displayName || 'Unknown User'}
                        </p>
                      </div>
                      <div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:text-red-800"
                          onClick={() => window.open(`/reports/${report.id}`, '_blank')}
                        >
                          <AlertTriangleIcon className="h-4 w-4 mr-1" /> Unverified
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-2">
                      <div>
                        <span className="font-medium">Incident Date:</span> {format(new Date(report.incidentDate), 'MMM d, yyyy')}
                      </div>
                      <div>
                        <span className="font-medium">Location:</span> {report.location}
                      </div>
                      {/* Proof Documents have been removed from the application */}
                    </div>
                    <p className="text-sm">
                      <span className="font-medium">Description:</span> {report.description}
                    </p>
                    {/* Proof Documents have been removed from the application */}
                    
                    {/* Admin action buttons */}
                    <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2 justify-end">
                      <Button 
                        variant="outline"
                        onClick={() => window.open(`/reports/${report.id}`, '_blank')}
                      >
                        <EyeIcon className="h-4 w-4 mr-2" /> View Details
                      </Button>
                      <Button 
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleVerify(report.id)}
                        disabled={verifyMutation.isPending}
                      >
                        <CheckIcon className="h-4 w-4 mr-2" /> 
                        {verifyMutation.isPending ? 'Verifying...' : 'Approve & Verify'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="verified" className="mt-6">
          <h2 className="text-xl font-semibold mb-4">Verified Reports</h2>
          {isVerifiedLoading ? (
            <div className="text-center py-8">Loading verified reports...</div>
          ) : !verifiedReports || !Array.isArray(verifiedReports) || verifiedReports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircleIcon className="h-12 w-12 mx-auto mb-2" />
              <p>No verified reports yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {verifiedReports.map((report: ScamReport) => (
                <Card key={report.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Verified</Badge>
                        </div>
                        <CardTitle className="flex items-center gap-2">
                          <Badge variant="outline">{report.scamType}</Badge>
                          {getScamIdentifier(report)}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Reported on {format(new Date(report.reportedAt), 'MMM d, yyyy')} by {report.user?.displayName || 'Unknown User'}
                        </p>
                      </div>
                      <div>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => window.open(`/reports/${report.id}`, '_blank')}
                        >
                          <EyeIcon className="h-4 w-4 mr-1" /> View
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-2">
                      <div>
                        <span className="font-medium">Incident Date:</span> {format(new Date(report.incidentDate), 'MMM d, yyyy')}
                      </div>
                      <div>
                        <span className="font-medium">Location:</span> {report.location}
                      </div>
                      {/* Proof Documents have been removed from the application */}
                    </div>
                    <p className="text-sm">
                      <span className="font-medium">Description:</span> {report.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="videos" className="mt-6">
          <ScamVideoManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
