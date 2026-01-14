import React, { useState, useMemo } from 'react';
import { Client, Job, FormData as FormDataType, FormType } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import {
    BackArrowIcon, UsersIcon, EstimateIcon, ChangeOrderIcon, InvoiceIcon,
    BriefcaseIcon, TruckIcon, CalendarIcon, MailIcon, HomeIcon,
    GlobeIcon, CheckIcon, CopyIcon, PenIcon, CheckCircleIcon
} from './Icons.tsx';

interface ClientDetailsProps {
    client: Client;
    jobs: Job[];
    docs: FormDataType[];
    onBack: () => void;
    onNavigateToJob: (jobId: string) => void;
    onNavigateToDoc: (formId: string, jobId: string, type: FormType) => void;
}

const ClientDetails: React.FC<ClientDetailsProps> = ({
    client,
    jobs,
    docs,
    onBack,
    onNavigateToJob,
    onNavigateToDoc
}) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'documents'>('overview');
    const [copiedPortal, setCopiedPortal] = useState(false);

    // Sort data by date (newest first)
    const sortedDocs = useMemo(() => {
        return [...docs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [docs]);

    const sortedJobs = useMemo(() => {
        return [...jobs].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [jobs]);

    // Timeline for Overview (Mix of latest Jobs and Docs)
    const timeline = useMemo(() => {
        const jobItems = sortedJobs.map(j => ({ type: 'job', date: j.startDate, data: j }));
        const docItems = sortedDocs.map(d => ({ type: 'doc', date: d.createdAt, data: d }));
        return [...jobItems, ...docItems]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
    }, [sortedJobs, sortedDocs]);

    const copyPortalLink = () => {
        if (!client.portal_key) return;
        const url = `${window.location.origin}?portal=${client.portal_key}`;
        navigator.clipboard.writeText(url);
        setCopiedPortal(true);
        setTimeout(() => setCopiedPortal(false), 2000);
    };

    const getDocIcon = (type: FormType) => {
        switch (type) {
            case FormType.Invoice: return InvoiceIcon;
            case FormType.Estimate: return EstimateIcon;
            case FormType.ChangeOrder: return ChangeOrderIcon;
            case FormType.PurchaseOrder: return TruckIcon;
            default: return InvoiceIcon; // Fallback
        }
    };

    const getDocTitle = (form: FormDataType) => {
        const d = form.data as any;
        return d.title || d.invoiceNumber || d.estimateNumber || d.reportNumber || d.workOrderNumber || d.warrantyNumber || d.changeOrderNumber || d.poNumber || ((d.receiptNumber) ? `Receipt #${d.receiptNumber}` : null) || form.type;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'bg-green-500';
            case 'completed': return 'bg-blue-500';
            case 'paused': return 'bg-orange-500';
            default: return 'bg-gray-400';
        }
    };

    const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-all duration-200 font-medium text-sm ${activeTab === id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                }`}
        >
            <Icon className={`w-4 h-4 ${activeTab === id ? 'text-blue-600 dark:text-blue-400' : ''}`} />
            {label}
        </button>
    );

    const StatsCard = ({ label, value, icon: Icon, colorClass }: { label: string, value: string | number, icon: any, colorClass: string }) => (
        <div className="bg-card/50 backdrop-blur-sm border rounded-xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className={`p-3 rounded-full bg-opacity-10 ${colorClass.replace('text-', 'bg-')}`}>
                <Icon className={`w-6 h-6 ${colorClass}`} />
            </div>
            <div>
                <p className="text-sm text-muted-foreground font-medium">{label}</p>
                <p className="text-2xl font-bold tracking-tight">{value}</p>
            </div>
        </div>
    );

    return (
        <div className="w-full h-full bg-background text-foreground flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Header Section */}
            <header className="relative overflow-hidden rounded-b-3xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-xl mb-8 -mx-4 md:-mx-8 md:-mt-8 p-8 pt-12 md:p-12">
                <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 p-24 bg-black/10 rounded-full blur-2xl -ml-12 -mb-12 pointer-events-none"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl font-bold border-2 border-white/30 shadow-inner">
                            {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{client.name}</h1>
                                {client.portal_key && (
                                    <span className="bg-green-400/20 text-green-100 border border-green-400/30 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 font-medium backdrop-blur-sm">
                                        <GlobeIcon className="w-3 h-3" /> Portal Active
                                    </span>
                                )}
                            </div>
                            <p className="text-blue-100 flex items-center gap-2 text-sm md:text-base">
                                <UsersIcon className="w-4 h-4 opacity-70" /> Client Profile
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            variant="secondary"
                            className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md shadow-lg"
                            onClick={onBack}
                        >
                            <BackArrowIcon className="w-4 h-4 mr-2" /> Back
                        </Button>
                        <Button
                            className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md shadow-lg"
                            onClick={() => alert("Get Approval feature coming soon to this view")}
                        >
                            <CheckIcon className="w-4 h-4 mr-2" /> Get Approval
                        </Button>
                        {client.portal_key && (
                            <Button
                                className="bg-white text-blue-700 hover:bg-blue-50 shadow-lg font-semibold"
                                onClick={copyPortalLink}
                            >
                                {copiedPortal ? <CheckIcon className="w-4 h-4 mr-2" /> : <GlobeIcon className="w-4 h-4 mr-2" />}
                                {copiedPortal ? 'Link Copied' : 'Portal Link'}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Stats Row integrated into header bottom or separate? Let's separate for cleanliness below header in grid */}
            </header>

            <div className="px-4 md:px-8 pb-12 max-w-7xl mx-auto w-full space-y-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 relative z-20">
                    <StatsCard
                        label="Active Projects"
                        value={jobs.filter(j => j.status === 'active').length}
                        icon={BriefcaseIcon}
                        colorClass="text-blue-600"
                    />
                    <StatsCard
                        label="Total Documents"
                        value={docs.length}
                        icon={InvoiceIcon}
                        colorClass="text-purple-600"
                    />
                    <StatsCard
                        label="Interactions"
                        value={timeline.length + "+"}
                        icon={CalendarIcon}
                        colorClass="text-orange-500"
                    />
                    <StatsCard
                        label="Client Since"
                        value={client.created_at ? new Date(client.created_at).getFullYear() : new Date().getFullYear()}
                        icon={CheckCircleIcon}
                        colorClass="text-green-600"
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Sidebar */}
                    <div className="lg:col-span-4 space-y-6">
                        <Card className="overflow-hidden border-t-4 border-t-blue-500 shadow-md">
                            <CardHeader className="bg-muted/10 pb-4">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <UsersIcon className="w-5 h-5 text-blue-500" /> Contact Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-5 pt-6">
                                <div className="group">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Email</p>
                                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 group-hover:bg-secondary/50 transition-colors">
                                        <MailIcon className="w-5 h-5 text-blue-500 shrink-0" />
                                        <p className="text-sm font-medium truncate select-all">{client.email || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="group">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Phone</p>
                                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 group-hover:bg-secondary/50 transition-colors">
                                        <UsersIcon className="w-5 h-5 text-green-500 shrink-0" /> {/* Fallback icon since PhoneIcon missing */}
                                        <p className="text-sm font-medium select-all">{client.phone || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="group">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Address</p>
                                    <div className="flex items-start gap-3 p-2.5 rounded-lg bg-secondary/30 group-hover:bg-secondary/50 transition-colors">
                                        <HomeIcon className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                                        <p className="text-sm font-medium leading-snug">{client.address || 'N/A'}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {client.notes && (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <PenIcon className="w-4 h-4 text-muted-foreground" /> Notes
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-sm text-muted-foreground bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-lg border border-yellow-100 dark:border-yellow-900/20 whitespace-pre-wrap leading-relaxed">
                                        {client.notes}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-8 flex flex-col">
                        <div className="flex items-center gap-2 border-b mb-6 overflow-x-auto no-scrollbar">
                            <TabButton id="overview" label="Overview" icon={HomeIcon} />
                            <TabButton id="projects" label="Projects" icon={BriefcaseIcon} />
                            <TabButton id="documents" label="Documents" icon={InvoiceIcon} />
                        </div>

                        <div className="flex-1 min-h-[400px]">
                            {/* OVERVIEW TAB */}
                            {activeTab === 'overview' && (
                                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                                    <div>
                                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                            <CalendarIcon className="w-5 h-5 text-blue-500" /> Recent Activity
                                        </h3>
                                        {timeline.length === 0 ? (
                                            <div className="p-8 text-center border rounded-xl bg-muted/5 text-muted-foreground">
                                                No recent activity found.
                                            </div>
                                        ) : (
                                            <div className="relative border-l-2 border-muted ml-4 space-y-6 pb-2">
                                                {timeline.map((item, idx) => {
                                                    const isJob = item.type === 'job';
                                                    const date = new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

                                                    return (
                                                        <div key={idx} className="relative pl-6">
                                                            <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-background ${isJob ? 'bg-blue-500' : 'bg-purple-500'}`}></div>
                                                            <div className="bg-card border rounded-lg p-3 shadow-sm hover:shadow-md transition-all cursor-pointer"
                                                                onClick={() => isJob ? onNavigateToJob((item.data as Job).id) : onNavigateToDoc((item.data as FormDataType).id, (item.data as FormDataType).jobId, (item.data as FormDataType).type)}>
                                                                <div className="flex justify-between items-start">
                                                                    <div>
                                                                        <span className={`text-[10px] uppercase font-bold tracking-wider mb-0.5 block ${isJob ? 'text-blue-600' : 'text-purple-600'}`}>
                                                                            {isJob ? 'Project Started' : (item.data as FormDataType).type}
                                                                        </span>
                                                                        <p className="font-semibold text-sm">
                                                                            {isJob ? (item.data as Job).name : getDocTitle(item.data as FormDataType)}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{date}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* PROJECTS TAB */}
                            {activeTab === 'projects' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                                    {sortedJobs.length === 0 ? (
                                        <div className="col-span-full p-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                                            <BriefcaseIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                            <p>No projects associated with this client.</p>
                                        </div>
                                    ) : (
                                        sortedJobs.map(job => (
                                            <div
                                                key={job.id}
                                                onClick={() => onNavigateToJob(job.id)}
                                                className="group relative bg-card hover:bg-gradient-to-br hover:from-card hover:to-blue-50/50 dark:hover:to-blue-900/20 border rounded-xl p-5 shadow-sm hover:shadow-lg transition-all cursor-pointer overflow-hidden"
                                            >
                                                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                                    <BriefcaseIcon className="w-16 h-16 text-blue-600 rotate-12" />
                                                </div>
                                                <div className="relative z-10">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold text-lg shadow-sm`}>
                                                            {job.name.charAt(0)}
                                                        </div>
                                                        <span className={`text-xs px-2 py-1 rounded-full font-medium border capitalize ${getStatusColor(job.status)} bg-opacity-10 text-opacity-90 border-opacity-20`}>
                                                            {job.status}
                                                        </span>
                                                    </div>
                                                    <h3 className="font-bold text-lg mb-1 truncate group-hover:text-blue-600 transition-colors">{job.name}</h3>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <CalendarIcon className="w-3.5 h-3.5" />
                                                        {new Date(job.startDate).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* DOCUMENTS TAB */}
                            {activeTab === 'documents' && (
                                <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                    {sortedDocs.length === 0 ? (
                                        <div className="p-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                                            <InvoiceIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                            <p>No documents found.</p>
                                        </div>
                                    ) : (
                                        sortedDocs.map(doc => {
                                            const Icon = getDocIcon(doc.type);
                                            const data = doc.data as any;

                                            return (
                                                <div
                                                    key={doc.id}
                                                    onClick={() => onNavigateToDoc(doc.id, doc.jobId, doc.type)}
                                                    className="flex items-center p-4 border rounded-xl bg-card hover:bg-secondary/40 hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer group"
                                                >
                                                    <div className="p-3 rounded-xl bg-secondary group-hover:bg-white dark:group-hover:bg-card shadow-sm mr-4 transition-colors">
                                                        <Icon className="w-6 h-6 text-muted-foreground group-hover:text-blue-600 transition-colors" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-center mb-0.5">
                                                            <p className="font-semibold text-foreground group-hover:text-blue-600 transition-colors truncate pr-4">
                                                                {getDocTitle(doc)}
                                                            </p>
                                                            {data.status && (
                                                                <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">
                                                                    {data.status}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                            <span className="font-medium text-foreground/70">{doc.type}</span>
                                                            <span>•</span>
                                                            <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity px-2">
                                                        <BackArrowIcon className="w-4 h-4 text-blue-400 rotate-180" />
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientDetails;
