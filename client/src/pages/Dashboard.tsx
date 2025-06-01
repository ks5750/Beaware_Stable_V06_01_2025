import * as React from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { 
  LayoutDashboardIcon, 
  PhoneIcon, 
  MailIcon, 
  BuildingIcon, 
  ShieldCheckIcon, 
  FileCheckIcon,
  PlusIcon,
  ClockIcon,
  MapPinIcon,
  CheckCircleIcon, 
  Clock8Icon,
  FileTextIcon,
  EyeIcon,
  ArrowRightIcon,
} from 'lucide-react';
// Import the API request function with auth headers
import { apiRequest } from '@/lib/api-interceptor';
import { format } from 'date-fns';

// Types
interface ScamStat {
  id: number;
  date: string;
  totalReports: number;
  phoneScams: number;
  emailScams: number;
  businessScams: number;
  reportsWithProof: number;
  verifiedReports: number;
}

interface ScamReport {
  id: number;
  scamType: 'phone' | 'email' | 'business';
  scamPhoneNumber: string | null;
  scamEmail: string | null;
  scamBusinessName: string | null;
  incidentDate: string;
  country: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  description: string;
  hasProofDocument: boolean;
  reportedAt: string;
  isVerified: boolean;
  verifiedBy: number | null;
  verifiedAt: string | null;
  userId: number;
  user: {
    id: number;
    displayName: string;
    email: string;
  };
  consolidatedInfo?: {
    id: number;
    identifier: string;
    reportCount: number;
  } | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [directUserReports, setDirectUserReports] = React.useState<ScamReport[]>([]);
  
  // Fetch scam statistics
  const { data: scamStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/scam-stats'],
    queryFn: async () => {
      const response = await apiRequest('/api/scam-stats');
      if (!response.ok) {
        throw new Error('Failed to fetch scam statistics');
      }
      return await response.json();
    }
  });
  
  // Fetch recent reports
  const { data: recentReports, isLoading: isLoadingReports } = useQuery({
    queryKey: ['/api/scam-reports/recent'],
    queryFn: async () => {
      const response = await apiRequest('/api/scam-reports/recent');
      if (!response.ok) {
        throw new Error('Failed to fetch recent reports');
      }
      const data = await response.json();
      console.log("Recent Reports Data:", data); // Debug: log the data
      return data;
    }
  });
  
  // Direct fetch for user reports (bypass TanStack Query)
  React.useEffect(() => {
    const fetchUserReports = async () => {
      if (!user) return;
      
      try {
        console.log("DIRECT FETCH - Fetching user reports for user ID:", user.id);
      
        // Get user from localStorage for auth headers
        const userJson = localStorage.getItem('user');
        const userData = userJson ? JSON.parse(userJson) : null;
        
        if (!userData) {
          console.error("No user data in localStorage");
          return;
        }
        
        // Create headers with auth information
        const headers = {
          'x-user-id': userData.id.toString(),
          'x-user-email': userData.email,
          'x-user-role': userData.role || 'user'
        };
        
        console.log("Using auth headers:", headers);
        
        // Full URL with host
        const baseUrl = `${window.location.protocol}//${window.location.host}`;
        const url = `${baseUrl}/api/users/${user.id}/scam-reports`;
        
        console.log("Making direct fetch to:", url);
        
        const response = await fetch(url, { headers });
        console.log("Direct fetch response status:", response.status);
      
        if (!response.ok) {
          console.error("Direct fetch failed:", response.statusText);
          return;
        }
        
        const contentType = response.headers.get('content-type');
        console.log("Direct fetch content-type:", contentType);
        
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log("Direct fetch data:", data);
          setDirectUserReports(data);
        } else {
          const text = await response.text();
          console.error("Direct fetch response is not JSON:", text.substring(0, 100));
        }
      } catch (error) {
        console.error("Direct fetch error:", error);
      }
    };
    
    fetchUserReports();
  }, [user]);
  
  // Fetch user's reports if user is logged in (using TanStack Query)
  const { data: userReports, isLoading: isLoadingUserReports } = useQuery({
    queryKey: ['/api/users', user?.id, 'scam-reports'],
    queryFn: async () => {
      if (!user) return [];
      
      console.log("Fetching user reports for user ID:", user.id);
      
      try {
        // Using the optimized apiRequest which now ensures proper URL with host
        const response = await apiRequest(`/api/users/${user.id}/scam-reports`);
        console.log("User reports API response status:", response.status);
        console.log("User reports API response headers:", 
          Object.fromEntries(response.headers.entries())
        );
        
        if (!response.ok) {
          console.error("Failed to fetch user reports:", response.statusText);
          throw new Error('Failed to fetch user reports');
        }
        
        const contentType = response.headers.get('content-type');
        console.log("Content-Type:", contentType);
        
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log("User reports data:", data);
          return data;
        } else {
          const text = await response.text();
          console.error("Response is not JSON:", text.substring(0, 100));
          return [];
        }
      } catch (error) {
        console.error("Error fetching user reports:", error);
        return [];
      }
    },
    enabled: !!user, // Only run query if user is logged in
  });
  
  // Helper to get scam identifier based on type
  const getScamIdentifier = (report: ScamReport) => {
    if (!report || !report.scamType) {
      return 'Unknown';
    }
    
    switch (report.scamType) {
      case 'phone':
        // Handle empty strings as well as null/undefined
        return report.scamPhoneNumber && report.scamPhoneNumber.trim() !== '' 
          ? report.scamPhoneNumber 
          : 'Unknown phone';
      case 'email':
        return report.scamEmail && report.scamEmail.trim() !== '' 
          ? report.scamEmail 
          : 'Unknown email';
      case 'business':
        return report.scamBusinessName && report.scamBusinessName.trim() !== '' 
          ? report.scamBusinessName 
          : 'Unknown business';
      default:
        return 'Unknown';
    }
  };
  
  // Prepare data for pie chart
  const pieChartData = scamStats ? [
    { name: 'Phone Scams', value: scamStats.phoneScams },
    { name: 'Email Scams', value: scamStats.emailScams },
    { name: 'Business Scams', value: scamStats.businessScams },
  ] : [];
  
  // Prepare data for bar chart
  const barChartData = [
    { name: 'Total Reports', value: scamStats?.totalReports || 0 },
    { name: 'Verified', value: scamStats?.verifiedReports || 0 },
    { name: 'With Evidence', value: scamStats?.reportsWithProof || 0 },
  ];
  
  // Colors for pie chart
  const COLORS = ['#ff9800', '#2196f3', '#4caf50'];
  
  // Debug data rendering
  console.log("isLoadingReports:", isLoadingReports);
  console.log("recentReports length:", recentReports?.length || 0);
  
  // Check user data from context and localStorage
  console.log("User from context:", user);
  const localStorageUser = localStorage.getItem('user');
  console.log("User from localStorage:", localStorageUser ? JSON.parse(localStorageUser) : null);
  
  // Log user reports data 
  console.log("isLoadingUserReports:", isLoadingUserReports);
  console.log("userReports:", userReports);
  
  if (recentReports && recentReports.length > 0) {
    console.log("First report sample:", JSON.stringify(recentReports[0], null, 2));
    
    // Check location fields in first report
    const report = recentReports[0];
    console.log("Location fields check:");
    console.log("- country:", report.country);
    console.log("- city:", report.city);
    console.log("- state:", report.state);
    console.log("- zipCode:", report.zipCode);
    
    // Check result of getScamIdentifier
    console.log("getScamIdentifier result:", getScamIdentifier(report));
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Overview</h1>
          <p className="text-muted-foreground mt-1">
            Scam reports and statistics at a glance
          </p>
          {user?.beawareUsername && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/10 text-primary">
                Your Anonymous ID: @{user.beawareUsername}
              </Badge>
              <span className="text-xs text-muted-foreground">This protects your privacy when reporting scams</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 mt-4 md:mt-0">
          <Button asChild variant="outline" className="gap-1">
            <Link href="/reports">
              <EyeIcon className="h-4 w-4" />
              <span>View Reports</span>
            </Link>
          </Button>
        </div>
      </div>
      
      {/* Stats Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Total Reports</p>
              <FileTextIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="text-2xl font-bold">{scamStats?.totalReports || 0}</div>
              {scamStats?.totalReports > 0 && (
                <div className="text-xs text-muted-foreground">
                  Since {format(new Date(scamStats.date), 'MMM d, yyyy')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Phone Scams</p>
              <PhoneIcon className="h-4 w-4 text-orange-500" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="text-2xl font-bold">{scamStats?.phoneScams || 0}</div>
              {scamStats?.totalReports > 0 && (
                <div className="flex items-center text-xs text-muted-foreground">
                  {Math.round((scamStats.phoneScams / scamStats.totalReports) * 100)}% of total
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Email Scams</p>
              <MailIcon className="h-4 w-4 text-blue-500" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="text-2xl font-bold">{scamStats?.emailScams || 0}</div>
              {scamStats?.totalReports > 0 && (
                <div className="flex items-center text-xs text-muted-foreground">
                  {Math.round((scamStats.emailScams / scamStats.totalReports) * 100)}% of total
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Business Scams</p>
              <BuildingIcon className="h-4 w-4 text-green-500" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="text-2xl font-bold">{scamStats?.businessScams || 0}</div>
              {scamStats?.totalReports > 0 && (
                <div className="flex items-center text-xs text-muted-foreground">
                  {Math.round((scamStats.businessScams / scamStats.totalReports) * 100)}% of total
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Scam Types Distribution</CardTitle>
            <CardDescription>
              Breakdown of reported scams by type
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-80 w-full">
              {isLoadingStats ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Loading data...</p>
                </div>
              ) : pieChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => 
                        `${name}: ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No data available</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Report Statistics</CardTitle>
            <CardDescription>
              Overview of report categories and verification status
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-80 w-full">
              {isLoadingStats ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Loading data...</p>
                </div>
              ) : barChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barChartData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No data available</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Reports Tabs Section */}
      <Tabs defaultValue="recent" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid">
          <TabsTrigger value="recent" className="flex gap-2 items-center">
            <ClockIcon className="h-4 w-4" />
            <span>Recent Reports</span>
          </TabsTrigger>
          <TabsTrigger value="your" className="flex gap-2 items-center" disabled={!user}>
            <FileCheckIcon className="h-4 w-4" />
            <span>Your Reports</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="recent" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Recent Reports</h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports">View All</Link>
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoadingReports ? (
              <div className="col-span-full text-center py-12">
                <p className="text-muted-foreground">Loading recent reports...</p>
              </div>
            ) : !recentReports || !Array.isArray(recentReports) || recentReports.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <p className="text-muted-foreground">No recent reports available</p>
              </div>
            ) : (
              recentReports.slice(0, 6).map((report: ScamReport) => (
                <Card key={report.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-2 items-center">
                        {report.scamType === 'phone' && <PhoneIcon className="h-4 w-4 text-orange-500" />}
                        {report.scamType === 'email' && <MailIcon className="h-4 w-4 text-blue-500" />}
                        {report.scamType === 'business' && <BuildingIcon className="h-4 w-4 text-green-500" />}
                        <CardTitle className="text-base">
                          {getScamIdentifier(report)}
                        </CardTitle>
                      </div>
                      <Badge variant={report.isVerified ? "default" : "outline"} className="ml-auto">
                        {report.isVerified ? "Verified" : "Pending"}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <ClockIcon className="h-3 w-3" />
                      {format(new Date(report.reportedAt), 'MMM d, yyyy')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <p className="text-sm line-clamp-2 text-muted-foreground">
                      {report.description}
                    </p>
                    
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <MapPinIcon className="h-3 w-3" />
                      <span>
                        {report.city && report.state 
                          ? `${report.city}, ${report.state}` 
                          : report.city 
                          ? report.city 
                          : report.state 
                          ? report.state 
                          : report.country || "USA"}
                      </span>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 border-t flex justify-end">
                    <Button asChild variant="ghost" size="sm" className="gap-1">
                      <Link href={`/reports/${report.id}`}>
                        Details
                        <ArrowRightIcon className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="your" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Your Reports</h2>
            <Button asChild size="sm">
              <Link href="/report">New Report</Link>
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoadingUserReports ? (
              <div className="col-span-full text-center py-12">
                <p className="text-muted-foreground">Loading your reports...</p>
              </div>
            ) : (!userReports || !Array.isArray(userReports) || userReports.length === 0) && 
                (!directUserReports || !Array.isArray(directUserReports) || directUserReports.length === 0) ? (
              <Card className="col-span-full p-6">
                <div className="flex flex-col items-center text-center py-8">
                  <div className="bg-primary/10 p-3 rounded-full mb-4">
                    <FileTextIcon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Reports Yet</h3>
                  <p className="text-muted-foreground max-w-md mb-6">
                    You haven't submitted any scam reports yet. Help our community by reporting any scams you've encountered.
                  </p>
                  <Button asChild>
                    <Link href="/report">Report a Scam</Link>
                  </Button>
                </div>
              </Card>
            ) : (
              // Use either the direct fetch data or TanStack Query data
              (directUserReports?.length ? directUserReports : userReports || []).map((report: ScamReport) => (
                <Card key={report.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-2 items-center">
                        {report.scamType === 'phone' && <PhoneIcon className="h-4 w-4 text-orange-500" />}
                        {report.scamType === 'email' && <MailIcon className="h-4 w-4 text-blue-500" />}
                        {report.scamType === 'business' && <BuildingIcon className="h-4 w-4 text-green-500" />}
                        <CardTitle className="text-base">
                          {getScamIdentifier(report)}
                        </CardTitle>
                      </div>
                      <Badge variant={report.isVerified ? "default" : "outline"} className="ml-auto">
                        {report.isVerified ? "Verified" : "Pending"}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <ClockIcon className="h-3 w-3" />
                      {format(new Date(report.reportedAt), 'MMM d, yyyy')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPinIcon className="h-3 w-3" />
                        <span>
                          {report.city && report.state 
                            ? `${report.city}, ${report.state}` 
                            : report.city 
                            ? report.city 
                            : report.state 
                            ? report.state 
                            : report.country || "USA"}
                        </span>
                      </div>
                      
                      {/* Proof Documents have been removed from the application */}
                      
                      {report.consolidatedInfo && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ShieldCheckIcon className="h-3 w-3" />
                          <span>Reported {report.consolidatedInfo.reportCount} times</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 border-t flex justify-end">
                    <Button asChild variant="ghost" size="sm" className="gap-1">
                      <Link href={`/reports/${report.id}`}>
                        Details
                        <ArrowRightIcon className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}