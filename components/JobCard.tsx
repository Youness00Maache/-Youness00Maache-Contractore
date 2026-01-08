import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/Card';
import { Button } from './ui/Button';
import { DropdownMenu, DropdownItem } from './ui/DropdownMenu';
import { MoreVerticalIcon, TrashIcon } from './Icons';
import { Job } from '../types';

interface JobCardProps {
    job: Job;
    onClick: () => void;
    onDelete: () => void;
    t: any; // Translation object
}

const getStatusColor = (status: string) => {
    switch (status) {
        case 'active': return 'bg-green-500';
        case 'completed': return 'bg-blue-500';
        case 'paused': return 'bg-orange-500';
        default: return 'bg-gray-400';
    }
}

export const JobCard: React.FC<JobCardProps> = ({ job, onClick, onDelete, t }) => {
    return (
        <Card className="flex flex-col transition-transform hover:-translate-y-1 hover:shadow-lg duration-200 relative">
            <CardHeader className="flex flex-col space-y-0 pb-1 pr-10">
                <div className="flex-1 min-w-0">
                    <CardTitle className="truncate text-lg mb-1.5">{job.name}</CardTitle>
                    <CardDescription className="truncate">{job.clientName}</CardDescription>
                </div>
            </CardHeader>
            <div className="absolute top-3 right-3">
                <DropdownMenu
                    trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8 p-0 rounded-full hover:bg-secondary">
                            <MoreVerticalIcon className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    }
                >
                    <DropdownItem onClick={(e) => { e.stopPropagation(); onDelete(); }} destructive>
                        <TrashIcon className="w-4 h-4 mr-2" />
                        Delete
                    </DropdownItem>
                </DropdownMenu>
            </div>
            <CardContent className="flex-grow pt-4">
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{job.clientAddress}</p>
                <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(job.status)} shadow-sm`}></span>
                    <p className="text-xs font-medium text-muted-foreground capitalize">{job.status}</p>
                </div>
            </CardContent>
            <CardFooter className="pt-2">
                <Button className="w-full" onClick={onClick}>{t.viewProject}</Button>
            </CardFooter>
        </Card>
    );
};
