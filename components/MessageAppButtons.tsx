import React from 'react';
import { smsHref, whatsappHref, whatsappNumber } from '../lib/messaging.ts';
import { MessageCircleIcon, MessageSquareIcon } from './Icons.tsx';

/**
 * "Text" and "WhatsApp" buttons: open the phone's own messaging app / WhatsApp with the message already typed in.
 * Nothing is sent by ContractorDocs and there's no SMS bill (competitor gap #9).
 *  - variant "tiles": two tiles for the Share window's action grid (pass the grid's tile class)
 *  - variant "row":   two small outline buttons
 */
export const MessageAppButtons: React.FC<{
    phone?: string | null;
    message: string;
    variant?: 'tiles' | 'row';
    tileClassName?: string;
    className?: string;
    /** called when one is opened (e.g. to remember that the client was messaged) */
    onOpen?: (channel: 'sms' | 'whatsapp') => void;
    /** greyed out with this reason (e.g. offline / document not synced yet) */
    disabledReason?: string | null;
}> = ({ phone, message, variant = 'row', tileClassName = '', className = '', onOpen, disabledReason }) => {
    const sms = smsHref(phone, message);
    const wa = whatsappHref(phone, message);
    const direct = Boolean(whatsappNumber(phone));
    const shownPhone = String(phone || '').trim();

    if (variant === 'tiles' && disabledReason) {
        return (
            <>
                <button type="button" className={tileClassName} disabled title={disabledReason}>
                    <span className="flex items-center gap-2 font-semibold text-foreground"><MessageSquareIcon className="h-4 w-4 text-primary" /> Text message</span>
                    <span className="truncate text-xs text-muted-foreground">Needs a connection</span>
                </button>
                <button type="button" className={tileClassName} disabled title={disabledReason}>
                    <span className="flex items-center gap-2 font-semibold text-foreground"><MessageCircleIcon className="h-4 w-4 text-primary" /> WhatsApp</span>
                    <span className="truncate text-xs text-muted-foreground">Needs a connection</span>
                </button>
            </>
        );
    }
    if (variant === 'tiles') {
        return (
            <>
                <a className={tileClassName} href={sms} onClick={() => onOpen?.('sms')}>
                    <span className="flex items-center gap-2 font-semibold text-foreground"><MessageSquareIcon className="h-4 w-4 text-primary" /> Text message</span>
                    <span className="truncate text-xs text-muted-foreground">{shownPhone ? `To ${shownPhone}, from your phone` : 'Opens your phone’s messages'}</span>
                </a>
                <a className={tileClassName} href={wa} target="_blank" rel="noopener noreferrer" onClick={() => onOpen?.('whatsapp')}>
                    <span className="flex items-center gap-2 font-semibold text-foreground"><MessageCircleIcon className="h-4 w-4 text-primary" /> WhatsApp</span>
                    <span className="truncate text-xs text-muted-foreground">{direct ? `Chat with ${shownPhone}` : 'Pick the chat in WhatsApp'}</span>
                </a>
            </>
        );
    }
    if (disabledReason) {
        return (
            <div className={`flex flex-wrap gap-2 ${className}`}>
                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" disabled title={disabledReason}><MessageSquareIcon className="h-4 w-4" /> Text</button>
                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" disabled title={disabledReason}><MessageCircleIcon className="h-4 w-4" /> WhatsApp</button>
            </div>
        );
    }
    return (
        <div className={`flex flex-wrap gap-2 ${className}`}>
            <a className="btn btn-outline btn-sm min-h-[40px]" href={sms} onClick={() => onOpen?.('sms')}>
                <MessageSquareIcon className="h-4 w-4" /> Text
            </a>
            <a className="btn btn-outline btn-sm min-h-[40px]" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => onOpen?.('whatsapp')} title={direct ? `WhatsApp ${shownPhone}` : 'WhatsApp (pick the chat)'}>
                <MessageCircleIcon className="h-4 w-4" /> WhatsApp
            </a>
        </div>
    );
};

export default MessageAppButtons;
