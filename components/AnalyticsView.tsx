
import React from 'react';
import { FormType, Job, FormData as FormDataType, InvoiceData, EstimateData } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, CreditCardIcon, ClockIcon, CheckCircleIcon, TrendingUpIcon, AwardIcon, PieChartIcon, BarChartIcon } from './Icons.tsx';

interface AnalyticsViewProps {
  jobs: Job[];
  forms: FormDataType[];
  onBack: () => void;
}

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ jobs, forms, onBack }) => {
  
  // --- Calculations ---

  let totalInvoiced = 0;
  let outstandingPayments = 0;
  let totalJobValue = 0;
  let invoiceCount = 0;

  // Revenue & Outstanding
  forms.forEach(form => {
      if (form.type === FormType.Invoice) {
          const data = form.data as InvoiceData;
          const subtotal = data.lineItems ? data.lineItems.reduce((acc, item) => acc + (Number(item.quantity || 0) * Number(item.rate || 0)), 0) : 0;
          const discount = Number(data.discount || 0);
          const shipping = Number(data.shipping || 0);
          const taxRate = Number(data.taxRate || 0);
          const taxAmount = (subtotal - discount) * (taxRate / 100);
          const total = (subtotal - discount) + taxAmount + shipping;

          totalInvoiced += total;
          invoiceCount++;
          
          if (data.status !== 'Paid') {
              outstandingPayments += total;
          }
          totalJobValue += total;
      }
  });

  // Win Rate (Estimates)
  const estimates = forms.filter(f => f.type === FormType.Estimate);
  const acceptedEstimates = estimates.filter(f => (f.data as EstimateData).status === 'Accepted');
  const winRate = estimates.length > 0 ? Math.round((acceptedEstimates.length / estimates.length) * 100) : 0;

  // Top Client Logic
  const clientRevenue: Record<string, number> = {};
  forms.forEach(form => {
    if (form.type === FormType.Invoice) {
        const data = form.data as InvoiceData;
        const clientName = data.clientName || 'Unknown';
        // Calculate total again or store it
        const subtotal = data.lineItems ? data.lineItems.reduce((acc, item) => acc + (Number(item.quantity || 0) * Number(item.rate || 0)), 0) : 0;
        const total = subtotal; // Simplified for leaderboard
        if (clientRevenue[clientName]) clientRevenue[clientName] += total;
        else clientRevenue[clientName] = total;
    }
  });
  
  let topClient = { name: 'N/A', amount: 0 };
  Object.entries(clientRevenue).forEach(([name, amount]) => {
      if (amount > topClient.amount) topClient = { name, amount };
  });

  // Average Job Value
  const avgJobValue = invoiceCount > 0 ? totalInvoiced / invoiceCount : 0;

  // Formatter
  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  // Mock Chart Data (Last 6 months) - In a real app, calculate from dates
  const chartData = [
    { month: 'Jun', height: '40%' },
    { month: 'Jul', height: '65%' },
    { month: 'Aug', height: '45%' },
    { month: 'Sep', height: '80%' },
    { month: 'Oct', height: '55%' },
    { month: 'Nov', height: '90%' },
  ];

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8 pb-24">
      <header className="flex items-center mb-8 border-b border-border pb-4">
         <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center mr-4" aria-label="Back">
            <BackArrowIcon className="h-9 w-9" />
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <TrendingUpIcon className="w-8 h-8 text-primary" />
            Business Insights
        </h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Financial Health */}
          <Card className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CreditCardIcon className="w-4 h-4" /> Total Invoiced
                </CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(totalInvoiced)}</div>
             </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-rose-100 dark:from-red-900/20 dark:to-rose-900/20 border-red-200 dark:border-red-800">
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <ClockIcon className="w-4 h-4" /> Outstanding
                </CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">{formatCurrency(outstandingPayments)}</div>
             </CardContent>
          </Card>

           <Card>
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-blue-500" /> Estimate Win Rate
                </CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold">{winRate}%</div>
                <p className="text-xs text-muted-foreground">{acceptedEstimates.length} of {estimates.length} accepted</p>
             </CardContent>
          </Card>

           <Card>
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <BarChartIcon className="w-4 h-4 text-purple-500" /> Avg. Job Value
                </CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(avgJobValue)}</div>
             </CardContent>
          </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Revenue Chart */}
          <Card className="lg:col-span-2 flex flex-col">
              <CardHeader>
                  <CardTitle>Revenue Trend (6 Months)</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex items-end justify-between gap-4 min-h-[200px]">
                  {chartData.map((d, i) => (
                      <div key={i} className="flex flex-col items-center flex-1 group">
                           <div className="w-full bg-secondary rounded-t-md relative h-40 overflow-hidden">
                               <div 
                                    className="absolute bottom-0 left-0 right-0 bg-primary transition-all duration-500 group-hover:opacity-80" 
                                    style={{ height: d.height }}
                               ></div>
                           </div>
                           <span className="text-xs text-muted-foreground mt-2">{d.month}</span>
                      </div>
                  ))}
              </CardContent>
          </Card>

          {/* Top Client */}
          <div className="space-y-4">
               <Card className="bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-200 dark:border-amber-800">
                  <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                          <AwardIcon className="w-6 h-6" /> Top Client
                      </CardTitle>
                  </CardHeader>
                  <CardContent>
                      <div className="text-3xl font-bold mb-1">{topClient.name}</div>
                      <div className="text-sm text-muted-foreground">Lifetime Value: <span className="font-bold text-foreground">{formatCurrency(topClient.amount)}</span></div>
                  </CardContent>
               </Card>

               <Card>
                   <CardHeader><CardTitle>Job Status</CardTitle></CardHeader>
                   <CardContent className="space-y-4">
                       <div className="flex justify-between items-center">
                           <span className="text-sm text-muted-foreground">Active Jobs</span>
                           <span className="font-bold">{jobs.filter(j => j.status === 'active').length}</span>
                       </div>
                       <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                           <div className="bg-blue-500 h-full" style={{ width: `${(jobs.filter(j => j.status === 'active').length / (jobs.length || 1)) * 100}%` }}></div>
                       </div>
                       
                       <div className="flex justify-between items-center">
                           <span className="text-sm text-muted-foreground">Completed</span>
                           <span className="font-bold">{jobs.filter(j => j.status === 'completed').length}</span>
                       </div>
                        <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                           <div className="bg-green-500 h-full" style={{ width: `${(jobs.filter(j => j.status === 'completed').length / (jobs.length || 1)) * 100}%` }}></div>
                       </div>
                   </CardContent>
               </Card>
          </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
