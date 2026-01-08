import React, { useState, useMemo } from 'react';
import { FormType, Job, FormData as FormDataType, InvoiceData, EstimateData } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, CreditCardIcon, ClockIcon, TrendingUpIcon, AwardIcon, PieChartIcon, BarChartIcon, CalendarIcon, CheckCircleIcon } from './Icons.tsx';

interface AnalyticsViewProps {
  jobs: Job[];
  forms: FormDataType[];
  onBack: () => void;
}

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ jobs, forms, onBack }) => {
  const [startDate, setStartDate] = useState(() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const metrics = useMemo(() => {
      let totalInvoiced = 0;
      let outstandingPayments = 0;
      let totalJobValue = 0;
      let invoiceCount = 0;
      let clientRevenue: Record<string, { total: number; count: number }> = {};
      let dailyRevenue: Record<string, number> = {};

      const jobCounts = { active: 0, inactive: 0, paused: 0, completed: 0 };
      jobs.forEach(job => {
          if (job.status === 'active') jobCounts.active++;
          else if (job.status === 'inactive') jobCounts.inactive++;
          else if (job.status === 'paused') jobCounts.paused++;
          else if (job.status === 'completed') jobCounts.completed++;
      });
      
      const totalJobs = jobs.length || 1;

      const filteredForms = forms.filter(form => {
          const formDate = new Date(form.createdAt);
          const start = new Date(startDate);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          return formDate >= start && formDate <= end;
      });

      filteredForms.forEach(form => {
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

              const clientName = data.clientName || 'Unknown';
              if (!clientRevenue[clientName]) clientRevenue[clientName] = { total: 0, count: 0 };
              clientRevenue[clientName].total += total;
              clientRevenue[clientName].count += 1;

              const dateKey = data.issueDate || form.createdAt.split('T')[0];
              if (!dailyRevenue[dateKey]) dailyRevenue[dateKey] = 0;
              dailyRevenue[dateKey] += total;
          }
      });

      const estimates = filteredForms.filter(f => f.type === FormType.Estimate);
      const acceptedEstimates = estimates.filter(f => (f.data as EstimateData).status === 'Accepted');
      const winRate = estimates.length > 0 ? Math.round((acceptedEstimates.length / estimates.length) * 100) : 0;

      const avgJobValue = invoiceCount > 0 ? totalInvoiced / invoiceCount : 0;

      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      const chartData: { label: string; value: number; height: string }[] = [];
      const isMonthly = daysDiff > 90;

      if (isMonthly) {
         const monthlyRevenue: Record<string, number> = {};
         Object.entries(dailyRevenue).forEach(([dateStr, amount]) => {
             const date = new Date(dateStr);
             const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
             monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + amount;
         });
         
         let current = new Date(start);
         current.setDate(1);
         while (current <= end) {
             const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
             const amount = monthlyRevenue[key] || 0;
             chartData.push({ 
                 label: current.toLocaleString('default', { month: 'short' }), 
                 value: amount, 
                 height: '0%' 
             });
             current.setMonth(current.getMonth() + 1);
         }
      } else {
         let current = new Date(start);
         while (current <= end) {
             const key = current.toISOString().split('T')[0];
             const amount = dailyRevenue[key] || 0;
             chartData.push({ 
                 label: current.getDate().toString(),
                 value: amount, 
                 height: '0%' 
             });
             current.setDate(current.getDate() + 1);
         }
      }

      const maxVal = Math.max(...chartData.map(d => d.value), 1);
      chartData.forEach(d => d.height = `${Math.max((d.value / maxVal) * 100, 4)}%`);

      const leaderboard = Object.entries(clientRevenue)
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);

      return {
          totalInvoiced,
          outstandingPayments,
          winRate,
          acceptedEstimatesCount: acceptedEstimates.length,
          totalEstimatesCount: estimates.length,
          avgJobValue,
          chartData,
          leaderboard,
          jobCounts,
          totalJobs
      };
  }, [forms, startDate, endDate, jobs]);


  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="w-full bg-background text-foreground flex flex-col p-4 md:p-8 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 border-b border-border pb-4 gap-4">
         <div className="flex items-center">
             <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center mr-4 hover:bg-secondary/80 rounded-full" aria-label="Back">
                <BackArrowIcon className="h-9 w-9" />
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <TrendingUpIcon className="w-8 h-8 text-primary" />
                Business Insights
            </h1>
         </div>
         
         <div className="flex items-center gap-2 bg-card p-1.5 rounded-lg border shadow-sm">
             <div className="px-2 text-muted-foreground"><CalendarIcon className="w-4 h-4" /></div>
             <div className="flex items-center gap-2">
                 <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent text-sm focus:outline-none font-medium text-foreground p-1 rounded hover:bg-secondary/50 cursor-pointer"
                 />
                 <span className="text-muted-foreground text-xs uppercase font-bold">to</span>
                 <input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent text-sm focus:outline-none font-medium text-foreground p-1 rounded hover:bg-secondary/50 cursor-pointer"
                 />
             </div>
         </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Financial Health */}
          <Card className="bg-card border-gray-400 dark:border-gray-600">
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CreditCardIcon className="w-4 h-4" /> Total Revenue
                </CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(metrics.totalInvoiced)}</div>
             </CardContent>
          </Card>

          <Card className="bg-card border-gray-400 dark:border-gray-600">
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <ClockIcon className="w-4 h-4" /> Outstanding
                </CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(metrics.outstandingPayments)}</div>
             </CardContent>
          </Card>

           <Card className="bg-card border-gray-400 dark:border-gray-600">
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4" /> Estimate Win Rate
                </CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold text-foreground">{metrics.winRate}%</div>
                <p className="text-xs text-muted-foreground">{metrics.acceptedEstimatesCount} of {metrics.totalEstimatesCount} accepted</p>
             </CardContent>
          </Card>

           <Card className="bg-card border-gray-400 dark:border-gray-600">
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <BarChartIcon className="w-4 h-4" /> Avg. Job Value
                </CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(metrics.avgJobValue)}</div>
             </CardContent>
          </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Revenue Chart */}
          <Card className="lg:col-span-2 flex flex-col min-h-[320px] max-h-[400px] bg-card border-gray-400 dark:border-gray-600">
              <CardHeader>
                  <CardTitle className="text-foreground">Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                  <div className="flex-1 flex items-end justify-between gap-2 pt-4 pb-2">
                    {metrics.chartData.length > 0 ? metrics.chartData.map((d, i) => (
                        <div key={i} className="flex flex-col items-center flex-1 group h-full justify-end">
                             <div className="relative w-full flex justify-center h-full items-end">
                                <div 
                                    className="w-full max-w-[30px] bg-primary rounded-t-sm transition-all duration-300 hover:opacity-80 relative shadow-sm" 
                                    style={{ height: d.height }}
                                >
                                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground text-xs font-bold px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 border border-border">
                                        {formatCurrency(d.value)}
                                    </div>
                                </div>
                             </div>
                             <span className="text-[10px] text-muted-foreground mt-2 truncate w-full text-center">{d.label}</span>
                        </div>
                    )) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            No revenue data for this period.
                        </div>
                    )}
                  </div>
              </CardContent>
          </Card>

          {/* Client Leaderboard Table */}
          <div className="space-y-4">
               <Card className="h-full bg-card border-gray-400 dark:border-gray-600">
                  <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-foreground">
                          <AwardIcon className="w-6 h-6" /> Top Clients
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                      <div className="overflow-hidden">
                          <table className="w-full text-sm text-left">
                              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                                  <tr>
                                      <th className="px-4 py-3 w-12 text-center">Rank</th>
                                      <th className="px-4 py-3">Client</th>
                                      <th className="px-4 py-3 text-right">Total</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                  {metrics.leaderboard.length > 0 ? metrics.leaderboard.map((client, index) => (
                                      <tr key={index} className="hover:bg-muted/30 transition-colors group">
                                          <td className="px-4 py-3 text-center font-medium">
                                              {index === 0 ? (
                                                  <div className="w-8 h-8 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center font-bold shadow-sm mx-auto">1</div>
                                              ) : index === 1 ? (
                                                  <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-bold shadow-sm mx-auto">2</div>
                                              ) : index === 2 ? (
                                                  <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-800 flex items-center justify-center font-bold shadow-sm mx-auto">3</div>
                                              ) : (
                                                  <span className="text-muted-foreground font-semibold">#{index + 1}</span>
                                              )}
                                          </td>
                                          <td className="px-4 py-3">
                                              <p className="font-semibold text-foreground truncate max-w-[140px]">{client.name}</p>
                                              <p className="text-xs text-muted-foreground">{client.count} job{client.count !== 1 ? 's' : ''}</p>
                                          </td>
                                          <td className="px-4 py-3 text-right font-bold font-mono text-foreground">
                                              {formatCurrency(client.total)}
                                          </td>
                                      </tr>
                                  )) : (
                                      <tr>
                                          <td colSpan={3} className="px-4 py-12 text-center text-muted-foreground">
                                              No clients yet.
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </CardContent>
               </Card>
          </div>
      </div>

      {/* Job Status Breakdown */}
      <Card className="mt-auto bg-card border-gray-400 dark:border-gray-600">
         <CardHeader className="pb-2">
            <CardTitle className="text-lg text-foreground">Job Overview</CardTitle>
         </CardHeader>
         <CardContent className="p-6">
             <div className="mb-4">
                {/* Progress Bar Visual */}
                <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex">
                    <div style={{ width: `${(metrics.jobCounts.active / metrics.totalJobs) * 100}%` }} className="bg-green-500 h-full" title="Active" />
                    <div style={{ width: `${(metrics.jobCounts.paused / metrics.totalJobs) * 100}%` }} className="bg-orange-500 h-full" title="Paused" />
                    <div style={{ width: `${(metrics.jobCounts.completed / metrics.totalJobs) * 100}%` }} className="bg-blue-500 h-full" title="Completed" />
                    <div style={{ width: `${(metrics.jobCounts.inactive / metrics.totalJobs) * 100}%` }} className="bg-gray-400 h-full" title="Inactive" />
                </div>
             </div>

             <div className="flex flex-wrap justify-between gap-4">
                 <div className="flex items-center gap-2">
                     <span className="w-3 h-3 rounded-full bg-green-500 shadow-sm"></span>
                     <div>
                        <span className="block text-sm font-medium text-foreground">Active</span>
                        <span className="text-xs text-muted-foreground font-bold">{metrics.jobCounts.active} Jobs</span>
                     </div>
                 </div>
                 <div className="flex items-center gap-2">
                     <span className="w-3 h-3 rounded-full bg-orange-500 shadow-sm"></span>
                     <div>
                        <span className="block text-sm font-medium text-foreground">Paused</span>
                        <span className="text-xs text-muted-foreground font-bold">{metrics.jobCounts.paused} Jobs</span>
                     </div>
                 </div>
                 <div className="flex items-center gap-2">
                     <span className="w-3 h-3 rounded-full bg-blue-500 shadow-sm"></span>
                     <div>
                        <span className="block text-sm font-medium text-foreground">Completed</span>
                        <span className="text-xs text-muted-foreground font-bold">{metrics.jobCounts.completed} Jobs</span>
                     </div>
                 </div>
                 <div className="flex items-center gap-2">
                     <span className="w-3 h-3 rounded-full bg-gray-400 shadow-sm"></span>
                     <div>
                        <span className="block text-sm font-medium text-foreground">Inactive</span>
                        <span className="text-xs text-muted-foreground font-bold">{metrics.jobCounts.inactive} Jobs</span>
                     </div>
                 </div>
             </div>
         </CardContent>
      </Card>

    </div>
  );
};

export default AnalyticsView;