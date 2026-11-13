import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SUPABASE_URL, supabase } from '../lib/supabase.ts';
import { BellIcon, CameraIcon, EditIcon, MessageCircleIcon, MessageSquareIcon, PlayIcon, PlusIcon, SendIcon, ThumbsDownIcon, ThumbsUpIcon, TrashIcon, UploadImageIcon } from './Icons.tsx';
import {
  ActionMenu, ConfirmDialog, EmptyState, Field, FlagIcon, InlineError, Modal, NoticeToast, PageHeader, Segmented, SkeletonList, XIcon,
  IMAGE_ACCEPT, friendlyError, getCurrentUserId, ownStoragePath, timeAgo, uploadToOwnFolder, useIsMobile, useNotice,
} from './viewKit.tsx';
import { compressImage } from '../utils/imageCompression.ts';

interface ForumViewProps {
  onBack: () => void;
  /** @deprecated the shared client from lib/supabase.ts is used */
  supabase?: unknown;
  /** Current session (optional; the view reads the session itself when absent). */
  session?: { user?: { id?: string } } | null;
  /** @deprecated ignored: images are uploaded to bucket `forum/<uid>/` by the view */
  onUploadImage?: (file: File) => Promise<string>;
  initialPostId?: string;
  onNavigate: (postId: string | null) => void;
  /** @deprecated ignored: errors are shown inline, never the DB setup screen (VIEW-042) */
  onDbSetupNeeded?: () => void;
  /** Lets the App keep the dashboard "Community" badge in sync (VIEW-043). */
  onUnreadCountChange?: (count: number) => void;
}

type Category = 'General' | 'Suggestion' | 'Project Showcase';
type Tab = Category | 'My Posts';
type SortKey = 'newest' | 'popular';
type CommentSort = 'oldest' | 'newest' | 'top';
type VoteType = 'up' | 'down' | null;

interface Post {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  image_url?: string | null;
  youtube_url?: string | null;
  upvotes: number;
  downvotes: number;
  created_at: string;
  comment_count: number;
  userVote: VoteType;
}

interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  image_url?: string | null;
  upvotes: number;
  downvotes: number;
  created_at: string;
  userVote: VoteType;
}

interface Author { name: string | null; avatar: string | null }

interface NotificationRow {
  id: string;
  type: string;
  post_id: string | null;
  source_user_id: string | null;
  created_at: string;
  is_read: boolean;
}

const CATEGORIES: Category[] = ['General', 'Suggestion', 'Project Showcase'];
const TAB_HELP: Record<Tab, string> = {
  General: 'Questions, tips and news from the trade.',
  Suggestion: 'Ideas for new ContractorDocs features. Vote for the ones you want.',
  'Project Showcase': 'Share photos of your latest work and get feedback.',
  'My Posts': 'Everything you have posted.',
};
const POST_PAGE = 20;
const COMMENT_PAGE = 30;
const POST_COLUMNS = 'id,user_id,title,content,category,image_url,youtube_url,upvotes,downvotes,created_at';
const COMMENT_COLUMNS = 'id,post_id,user_id,content,image_url,upvotes,downvotes,created_at';
const BUCKET = 'forum';

// ------------------------------------------------------------------------------------------------
// Exported helper for the App's dashboard badge
// ------------------------------------------------------------------------------------------------

/** Number of unread forum notifications for the signed-in user (0 on any error). */
export const fetchForumUnreadCount = async (): Promise<number> => {
  const uid = await getCurrentUserId();
  if (!uid) return 0;
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('is_read', false);
  return error ? 0 : count || 0;
};

// ------------------------------------------------------------------------------------------------
// Safe rendering helpers
// ------------------------------------------------------------------------------------------------

const FORUM_PUBLIC_PREFIX = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/` : '';

/** Only images stored in our own `forum` bucket are rendered (no tracking pixels or mixed content: VIEW-044). */
const isTrustedImage = (url?: string | null): url is string => {
  if (!url || typeof url !== 'string') return false;
  if (FORUM_PUBLIC_PREFIX) return url.startsWith(FORUM_PUBLIC_PREFIX);
  return /^https:\/\//i.test(url) && url.includes(`/storage/v1/object/public/${BUCKET}/`);
};

const isTrustedAvatar = (url?: string | null): url is string => !!url && /^https?:\/\//i.test(url) && (url.startsWith('https://') || (!!SUPABASE_URL && url.startsWith(SUPABASE_URL)));

export const getYouTubeId = (input?: string | null): string | null => {
  if (!input) return null;
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = /^\/(embed|shorts|v|live)\/([^/?#]+)/.exec(u.pathname);
        id = m ? m[2] : null;
      }
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
};

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Plain text with clickable http(s) links. React escapes everything, so no HTML can be injected. */
const LinkifiedText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const parts = useMemo(() => {
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
      let url = m[0];
      const trail = /[.,;:!?)\]]+$/.exec(url)?.[0] || '';
      if (trail) url = url.slice(0, -trail.length);
      const idx = m.index ?? 0;
      if (idx > last) out.push(text.slice(last, idx));
      out.push(<a key={idx} href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">{url}</a>);
      last = idx + url.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text]);
  return <p className={`whitespace-pre-wrap break-words ${className || ''}`}>{parts}</p>;
};

const Avatar: React.FC<{ author?: Author; size?: 'sm' | 'md' }> = ({ author, size = 'sm' }) => {
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
  const name = author?.name || 'Member';
  if (isTrustedAvatar(author?.avatar)) return <img src={author!.avatar!} alt="" className={`${dim} shrink-0 rounded-full border border-border object-cover`} loading="lazy" />;
  return <span className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground`} aria-hidden="true">{name.trim().charAt(0).toUpperCase() || '?'}</span>;
};

const VoteControl: React.FC<{ score: number; vote: VoteType; onVote: (v: 1 | -1) => void; busy?: boolean; vertical?: boolean; size?: 'sm' | 'md' }> = ({ score, vote, onVote, busy, vertical = true, size = 'md' }) => (
  <div className={`flex items-center ${vertical ? 'flex-col' : 'flex-row gap-1'}`} onClick={(e) => e.stopPropagation()}>
    <button type="button" aria-label="Upvote" aria-pressed={vote === 'up'} disabled={busy} onClick={() => onVote(1)} className={`flex items-center justify-center rounded-lg transition ${size === 'sm' ? 'h-9 w-9' : 'h-10 w-10'} ${vote === 'up' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
      <ThumbsUpIcon className="h-[18px] w-[18px]" />
    </button>
    <span className={`min-w-[2ch] text-center text-sm font-bold tabular-nums ${score > 0 ? 'text-foreground' : score < 0 ? 'text-destructive' : 'text-muted-foreground'}`} aria-label={`Score ${score}`}>{score}</span>
    <button type="button" aria-label="Downvote" aria-pressed={vote === 'down'} disabled={busy} onClick={() => onVote(-1)} className={`flex items-center justify-center rounded-lg transition ${size === 'sm' ? 'h-9 w-9' : 'h-10 w-10'} ${vote === 'down' ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
      <ThumbsDownIcon className="h-[18px] w-[18px]" />
    </button>
  </div>
);

const YouTubeEmbed: React.FC<{ url?: string | null }> = ({ url }) => {
  const id = getYouTubeId(url);
  if (!id) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black">
      <div className="relative aspect-video">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`}
          title="YouTube video"
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
    </div>
  );
};

/**
 * Post title/body in the list, clamped like before, with the original forum's "Show more" toggle.
 * The toggle only appears when the text is actually cut off (measured, so it is right on every screen width).
 */
const ExpandableText: React.FC<{ text: string; as: 'h3' | 'p'; className: string; clampClass: 'line-clamp-3' | 'line-clamp-4'; onOpen: () => void; focusable?: boolean }> = ({ text, as, className, clampClass, onOpen, focusable = true }) => {
  const ref = useRef<HTMLHeadingElement & HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  const cls = `${className} ${expanded ? '' : clampClass}`;
  return (
    <>
      <button type="button" onClick={onOpen} tabIndex={focusable ? undefined : -1} className="block w-full text-left">
        {as === 'h3' ? <h3 ref={ref} className={cls}>{text}</h3> : <p ref={ref} className={cls}>{text}</p>}
      </button>
      {(clipped || expanded) && (
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="mt-0.5 rounded text-xs font-semibold text-primary hover:underline">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  );
};

/**
 * "Take a photo" for posts and comments (the original forum's in-app camera). Uses getUserMedia when the
 * browser has it; otherwise (or if the camera can't be opened) it falls back to the phone's own camera
 * app through `<input capture>`.
 */
const CameraButton: React.FC<{ onPhoto: (file: File) => void; onOpenChange?: (open: boolean) => void; className: string; disabled?: boolean; ariaLabel?: string; children: React.ReactNode }> = ({ onPhoto, onOpenChange, className, disabled, ariaLabel, children }) => {
  const [open, setOpen] = useState(false);
  const captureRef = useRef<HTMLInputElement>(null);
  const setOpenState = (v: boolean) => { setOpen(v); onOpenChange?.(v); };
  const onCaptureInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) { setOpenState(false); onPhoto(f); }
  };
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => (navigator.mediaDevices?.getUserMedia ? setOpenState(true) : captureRef.current?.click())}
      >
        {children}
      </button>
      <input ref={captureRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onCaptureInput} />
      {open && <CameraModal onClose={() => setOpenState(false)} onPhoto={(f) => { setOpenState(false); onPhoto(f); }} onCaptureInput={onCaptureInput} />}
    </>
  );
};

const CameraModal: React.FC<{ onClose: () => void; onPhoto: (file: File) => void; onCaptureInput: (e: React.ChangeEvent<HTMLInputElement>) => void }> = ({ onClose, onPhoto, onCaptureInput }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'ready' | 'failed'>('starting');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
        catch (e: any) {
          if (e?.name === 'NotAllowedError') throw e;
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => undefined); }
      } catch (e: any) {
        if (cancelled) return;
        setStatus('failed');
        setError(e?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it in your browser settings, or use your camera app below.'
          : e?.name === 'NotFoundError' ? 'No camera was found on this device.' : 'The camera could not be opened.');
      }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob((blob) => { if (blob) onPhoto(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })); }, 'image/jpeg', 0.9);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Take a photo"
      footer={<><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" onClick={capture} disabled={status !== 'ready'}><CameraIcon className="h-4 w-4" /> Capture</button></>}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="h-full w-full object-contain" playsInline muted autoPlay onLoadedData={() => setStatus((s) => (s === 'failed' ? s : 'ready'))} />
        {status !== 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <CameraIcon className={`h-10 w-10 ${status === 'starting' ? 'animate-pulse opacity-80' : 'opacity-60'}`} />
            <p className="text-sm">{status === 'starting' ? 'Starting camera…' : error}</p>
            {status === 'failed' && (
              <label className="btn btn-outline cursor-pointer border-white/40 bg-transparent text-white hover:bg-white/10">
                Use camera app
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onCaptureInput} />
              </label>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

const applyVote = <T extends { upvotes: number; downvotes: number; userVote: VoteType }>(row: T, value: 1 | -1): T => {
  const type: VoteType = value === 1 ? 'up' : 'down';
  let { upvotes, downvotes } = row;
  if (row.userVote === 'up') upvotes -= 1;
  if (row.userVote === 'down') downvotes -= 1;
  const next: VoteType = row.userVote === type ? null : type;
  if (next === 'up') upvotes += 1;
  if (next === 'down') downvotes += 1;
  return { ...row, upvotes: Math.max(0, upvotes), downvotes: Math.max(0, downvotes), userVote: next };
};

const withServerScore = <T extends { upvotes: number; downvotes: number }>(row: T, score: unknown): T => {
  const s = typeof score === 'number' ? score : typeof score === 'string' && score.trim() !== '' && Number.isFinite(Number(score)) ? Number(score) : null;
  if (s === null || s === row.upvotes - row.downvotes) return row;
  // keep the down count, derive ups from the authoritative score
  return { ...row, upvotes: Math.max(0, s + row.downvotes) };
};

const normalizePost = (r: any, vote: VoteType = null): Post => ({
  id: r.id, user_id: r.user_id, title: String(r.title ?? ''), content: String(r.content ?? ''), category: r.category || 'General',
  image_url: r.image_url ?? null, youtube_url: r.youtube_url ?? null, upvotes: Number(r.upvotes) || 0, downvotes: Number(r.downvotes) || 0,
  created_at: r.created_at, comment_count: Number(r.comment_count ?? (Array.isArray(r.forum_comments) ? r.forum_comments[0]?.count : 0)) || 0, userVote: vote,
});

const normalizeComment = (r: any, vote: VoteType = null): Comment => ({
  id: r.id, post_id: r.post_id, user_id: r.user_id, content: String(r.content ?? ''), image_url: r.image_url ?? null,
  upvotes: Number(r.upvotes) || 0, downvotes: Number(r.downvotes) || 0, created_at: r.created_at, userVote: vote,
});

interface PostDraft {
  id?: string;
  title: string;
  content: string;
  category: Category;
  youtube: string;
  imageUrl: string | null;
  file: File | null;
  preview: string | null;
}

// ================================================================================================

const ForumView: React.FC<ForumViewProps> = ({ onBack, session, initialPostId, onNavigate, onUnreadCountChange }) => {
  const isMobile = useIsMobile();
  const { notice, notify, clear } = useNotice();
  const [uid, setUid] = useState<string | null>(session?.user?.id ?? null);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const authorsRef = useRef(authors);
  authorsRef.current = authors;
  const authorSource = useRef<'forum_authors' | 'profiles' | null>(null);

  // list
  const [tab, setTab] = useState<Tab>('General');
  const [sort, setSort] = useState<SortKey>('newest');
  const [posts, setPosts] = useState<Post[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const listRequest = useRef(0);

  // detail
  const [detail, setDetail] = useState<Post | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'missing' | 'error'>('idle');
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentSort, setCommentSort] = useState<CommentSort>('oldest');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsMore, setCommentsMore] = useState(false);
  const [reply, setReply] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [replyPreview, setReplyPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [editingComment, setEditingComment] = useState<{ id: string; text: string } | null>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);

  // modals
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [savingPost, setSavingPost] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  /** While the camera is open over the post editor, Escape/backdrop must not close (and lose) the draft. */
  const [draftCameraOpen, setDraftCameraOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'post' | 'comment'; id: string; imageUrl?: string | null } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [report, setReport] = useState<{ kind: 'post' | 'comment'; id: string } | null>(null);
  const [reportReason, setReportReason] = useState('Spam or advertising');
  const [reportBusy, setReportBusy] = useState(false);
  const [voting, setVoting] = useState<Record<string, boolean>>({});

  // notifications
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [notifTitles, setNotifTitles] = useState<Record<string, string>>({});
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const unreadCb = useRef(onUnreadCountChange);
  unreadCb.current = onUnreadCountChange;

  useEffect(() => {
    if (!uid) getCurrentUserId().then((id) => id && setUid(id));
  }, [uid]);

  const setUnreadCount = useCallback((n: number) => { setUnread(n); unreadCb.current?.(n); }, []);

  // ---------------------------------------------------------------- authors
  const loadAuthors = useCallback(async (ids: (string | null | undefined)[]) => {
    const missing = Array.from(new Set(ids.filter((id): id is string => !!id && !(id in authorsRef.current))));
    if (!missing.length) return;
    const tryFrom = async (table: 'forum_authors' | 'profiles') => supabase.from(table).select('id,name,profile_picture_url').in('id', missing);
    let rows: any[] | null = null;
    if (authorSource.current !== 'profiles') {
      const { data, error } = await tryFrom('forum_authors');
      if (!error) { rows = data; authorSource.current = 'forum_authors'; }
    }
    if (!rows) {
      const { data, error } = await tryFrom('profiles');
      if (!error) { rows = data; authorSource.current = 'profiles'; }
    }
    const next: Record<string, Author> = {};
    for (const id of missing) next[id] = { name: null, avatar: null };
    for (const r of rows || []) next[r.id] = { name: r.name || null, avatar: r.profile_picture_url || null };
    setAuthors((prev) => ({ ...prev, ...next }));
  }, []);

  const authorName = (id: string) => (id === uid ? 'You' : authors[id]?.name || 'Member');

  // ---------------------------------------------------------------- list
  const fetchMyVotes = useCallback(async (postIds: string[]) => {
    if (!uid || !postIds.length) return new Map<string, VoteType>();
    const { data } = await supabase.from('forum_votes').select('post_id,vote_type').eq('user_id', uid).in('post_id', postIds);
    return new Map<string, VoteType>((data || []).map((v: any) => [v.post_id, v.vote_type === 'down' ? 'down' : 'up']));
  }, [uid]);

  const loadPosts = useCallback(async (offset: number) => {
    if (!uid) return;
    const req = ++listRequest.current;
    if (offset === 0) { setListLoading(true); setListError(null); } else setLoadingMore(true);
    let q = supabase.from('forum_posts').select(`${POST_COLUMNS},forum_comments(count)`);
    q = tab === 'My Posts' ? q.eq('user_id', uid) : q.eq('category', tab);
    q = sort === 'popular' ? q.order('upvotes', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false });
    const { data, error } = await q.range(offset, offset + POST_PAGE - 1);
    if (req !== listRequest.current) return;
    if (error) {
      setListError(friendlyError(error, 'Could not load posts.'));
    } else {
      const rows = data || [];
      const votes = await fetchMyVotes(rows.map((r: any) => r.id));
      if (req !== listRequest.current) return;
      const mapped = rows.map((r: any) => normalizePost(r, votes.get(r.id) ?? null));
      setPosts((prev) => (offset === 0 ? mapped : [...prev, ...mapped.filter((p) => !prev.some((x) => x.id === p.id))]));
      setHasMore(rows.length === POST_PAGE);
      loadAuthors(rows.map((r: any) => r.user_id));
    }
    setListLoading(false);
    setLoadingMore(false);
  }, [uid, tab, sort, fetchMyVotes, loadAuthors]);

  useEffect(() => { loadPosts(0); }, [loadPosts]);

  // ---------------------------------------------------------------- detail (deep link /forum/:id)
  const loadComments = useCallback(async (postId: string, offset: number) => {
    setCommentsLoading(true);
    let q = supabase.from('forum_comments').select(COMMENT_COLUMNS).eq('post_id', postId);
    q = commentSort === 'top' ? q.order('upvotes', { ascending: false }).order('created_at', { ascending: true }) : q.order('created_at', { ascending: commentSort === 'oldest' });
    const { data, error } = await q.range(offset, offset + COMMENT_PAGE - 1);
    if (error) { notify('error', friendlyError(error, 'Could not load comments.')); setCommentsLoading(false); return; }
    const rows = data || [];
    let votes = new Map<string, VoteType>();
    if (uid && rows.length) {
      const { data: vd } = await supabase.from('forum_comment_votes').select('comment_id,vote_type').eq('user_id', uid).in('comment_id', rows.map((r: any) => r.id));
      votes = new Map((vd || []).map((v: any) => [v.comment_id, v.vote_type === 'down' ? 'down' : 'up']));
    }
    const mapped = rows.map((r: any) => normalizeComment(r, votes.get(r.id) ?? null));
    setComments((prev) => (offset === 0 ? mapped : [...prev, ...mapped.filter((c) => !prev.some((x) => x.id === c.id))]));
    setCommentsMore(rows.length === COMMENT_PAGE);
    loadAuthors(rows.map((r: any) => r.user_id));
    setCommentsLoading(false);
  }, [commentSort, uid, notify, loadAuthors]);

  useEffect(() => {
    if (!initialPostId) { setDetail(null); setDetailState('idle'); setComments([]); return; }
    if (!uid) return;
    let cancelled = false;
    const cached = posts.find((p) => p.id === initialPostId);
    if (cached) { setDetail(cached); setDetailState('idle'); } else { setDetail(null); setDetailState('loading'); }
    (async () => {
      const { data, error } = await supabase.from('forum_posts').select(`${POST_COLUMNS},forum_comments(count)`).eq('id', initialPostId).maybeSingle();
      if (cancelled) return;
      if (error) { if (!cached) setDetailState('error'); return; }
      if (!data) { setDetail(null); setDetailState('missing'); return; }
      const votes = await fetchMyVotes([data.id]);
      if (cancelled) return;
      setDetail(normalizePost(data, votes.get(data.id) ?? null));
      setDetailState('idle');
      loadAuthors([data.user_id]);
    })();
    window.scrollTo({ top: 0 });
    return () => { cancelled = true; };
  }, [initialPostId, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialPostId && uid) loadComments(initialPostId, 0);
  }, [initialPostId, uid, commentSort]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (replyPreview) URL.revokeObjectURL(replyPreview); }, [replyPreview]);

  // ---------------------------------------------------------------- votes (server-side counters: VIEW-041)
  const votePost = async (post: Post, value: 1 | -1) => {
    if (voting[post.id]) return;
    const optimistic = applyVote(post, value);
    const patch = (fn: (p: Post) => Post) => {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? fn(p) : p)));
      setDetail((d) => (d && d.id === post.id ? fn(d) : d));
    };
    patch(() => optimistic);
    setVoting((v) => ({ ...v, [post.id]: true }));
    const { data, error } = await supabase.rpc('toggle_forum_vote', { p_post_id: post.id, p_value: value });
    setVoting((v) => ({ ...v, [post.id]: false }));
    if (error) { patch(() => post); notify('error', friendlyError(error, 'Your vote could not be saved.')); return; }
    patch((p) => withServerScore(p, data));
  };

  const voteComment = async (c: Comment, value: 1 | -1) => {
    if (voting[c.id]) return;
    const optimistic = applyVote(c, value);
    setComments((prev) => prev.map((x) => (x.id === c.id ? optimistic : x)));
    setVoting((v) => ({ ...v, [c.id]: true }));
    const { data, error } = await supabase.rpc('toggle_forum_comment_vote', { p_comment_id: c.id, p_value: value });
    setVoting((v) => ({ ...v, [c.id]: false }));
    if (error) { setComments((prev) => prev.map((x) => (x.id === c.id ? c : x))); notify('error', friendlyError(error, 'Your vote could not be saved.')); return; }
    setComments((prev) => prev.map((x) => (x.id === c.id ? withServerScore(x, data) : x)));
  };

  // ---------------------------------------------------------------- images
  const uploadImage = async (file: File) => {
    const id = uid ?? (await getCurrentUserId());
    if (!id) throw new Error('Your session has expired. Please sign in again.');
    let toSend: File = file;
    try { toSend = await compressImage(file); } catch { /* keep original */ }
    return uploadToOwnFolder(BUCKET, toSend, id, file.name);
  };
  const deleteImage = async (url?: string | null) => {
    if (!url || !uid) return;
    const path = ownStoragePath(url, BUCKET, uid);
    if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
  };
  const pickImage = (file: File | undefined | null, onOk: (f: File, preview: string) => void) => {
    if (!file) return;
    if (!IMAGE_ACCEPT.split(',').includes(file.type)) { notify('error', 'Use a JPG, PNG, WebP or GIF image.'); return; }
    if (file.size > 15 * 1024 * 1024) { notify('error', 'That image is larger than 15 MB.'); return; }
    onOk(file, URL.createObjectURL(file));
  };

  // ---------------------------------------------------------------- posts CRUD
  const openNewPost = () => {
    setDraftError(null);
    setDraft({ title: '', content: '', category: tab === 'My Posts' ? 'General' : tab, youtube: '', imageUrl: null, file: null, preview: null });
  };
  const openEditPost = (p: Post) => {
    setDraftError(null);
    setDraft({ id: p.id, title: p.title, content: p.content, category: (CATEGORIES.includes(p.category as Category) ? p.category : 'General') as Category, youtube: p.youtube_url || '', imageUrl: isTrustedImage(p.image_url) ? p.image_url! : null, file: null, preview: null });
  };
  const closeDraft = () => { if (draft?.preview) URL.revokeObjectURL(draft.preview); setDraft(null); setDraftCameraOpen(false); };

  const savePost = async () => {
    if (!draft || !uid) return;
    const title = draft.title.trim();
    const content = draft.content.trim();
    const youtube = draft.youtube.trim();
    if (title.length < 3) { setDraftError('Add a title (at least 3 characters).'); return; }
    if (!content && !draft.file && !draft.imageUrl && !youtube) { setDraftError('Write something or add a photo or video.'); return; }
    if (youtube && !getYouTubeId(youtube)) { setDraftError('That YouTube link is not valid.'); return; }
    setSavingPost(true);
    setDraftError(null);
    let uploaded: string | null = null;
    try {
      if (draft.file) uploaded = await uploadImage(draft.file);
      const imageUrl = uploaded ?? draft.imageUrl;
      const fields = { title, content, category: draft.category, youtube_url: youtube || null, image_url: imageUrl };
      if (draft.id) {
        const before = posts.find((p) => p.id === draft.id) || (detail?.id === draft.id ? detail : null);
        const { data, error } = await supabase.from('forum_posts').update(fields).eq('id', draft.id).eq('user_id', uid).select(POST_COLUMNS).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('You can only edit your own posts.');
        const merge = (p: Post) => ({ ...p, ...normalizePost(data, p.userVote), comment_count: p.comment_count });
        setPosts((prev) => prev.map((p) => (p.id === draft.id ? merge(p) : p)));
        setDetail((d) => (d && d.id === draft.id ? merge(d) : d));
        if (before?.image_url && before.image_url !== imageUrl) deleteImage(before.image_url);
        notify('success', 'Post updated.');
      } else {
        const { data, error } = await supabase.from('forum_posts').insert({ ...fields, user_id: uid }).select(POST_COLUMNS).single();
        if (error) throw error;
        const created = normalizePost({ ...data, comment_count: 0 });
        if (tab === 'My Posts' || tab === created.category) setPosts((prev) => [created, ...prev]);
        else setTab(created.category as Category);
        notify('success', 'Your post is live.');
      }
      closeDraft();
    } catch (e) {
      if (uploaded) deleteImage(uploaded);
      setDraftError(friendlyError(e, 'Your post could not be saved.'));
    } finally {
      setSavingPost(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm || !uid) return;
    setConfirmBusy(true);
    const table = confirm.kind === 'post' ? 'forum_posts' : 'forum_comments';
    const { error, count } = await supabase.from(table).delete({ count: 'exact' }).eq('id', confirm.id).eq('user_id', uid);
    setConfirmBusy(false);
    if (error) { notify('error', friendlyError(error, 'Could not delete.')); return; }
    if (count === 0) { notify('error', `You can only delete your own ${confirm.kind === 'post' ? 'posts' : 'comments'}.`); setConfirm(null); return; }
    deleteImage(confirm.imageUrl);
    if (confirm.kind === 'post') {
      setPosts((prev) => prev.filter((p) => p.id !== confirm.id));
      if (detail?.id === confirm.id) onNavigate(null);
      notify('success', 'Post deleted.');
    } else {
      setComments((prev) => prev.filter((c) => c.id !== confirm.id));
      const bump = (p: Post) => ({ ...p, comment_count: Math.max(0, p.comment_count - 1) });
      setDetail((d) => (d ? bump(d) : d));
      setPosts((prev) => prev.map((p) => (p.id === detail?.id ? bump(p) : p)));
      notify('success', 'Comment deleted.');
    }
    setConfirm(null);
  };

  const sendReport = async () => {
    if (!report || !uid) return;
    setReportBusy(true);
    const row = report.kind === 'post' ? { post_id: report.id, reason: reportReason, reporter_id: uid } : { comment_id: report.id, reason: reportReason, reporter_id: uid };
    const { error } = await supabase.from('forum_reports').insert(row);
    setReportBusy(false);
    if (error && error.code !== '23505') {
      notify('error', /forum_reports|does not exist|schema cache/i.test(error.message || '') ? 'Reporting is temporarily unavailable. Please email support.' : friendlyError(error, 'The report could not be sent.'));
      return;
    }
    setReport(null);
    notify('success', error ? 'You already reported this. Thanks!' : 'Thanks, our team will review it.');
  };

  // ---------------------------------------------------------------- comments
  const sendComment = async () => {
    if (!detail || !uid || sending) return;
    const text = reply.trim();
    if (!text && !replyFile) return;
    setSending(true);
    let uploaded: string | null = null;
    try {
      if (replyFile) uploaded = await uploadImage(replyFile);
      const { data, error } = await supabase.from('forum_comments').insert({ post_id: detail.id, user_id: uid, content: text, image_url: uploaded }).select(COMMENT_COLUMNS).single();
      if (error) throw error;
      const c = normalizeComment(data);
      setComments((prev) => (commentSort === 'newest' ? [c, ...prev] : [...prev, c]));
      const bump = (p: Post) => ({ ...p, comment_count: p.comment_count + 1 });
      setDetail((d) => (d ? bump(d) : d));
      setPosts((prev) => prev.map((p) => (p.id === detail.id ? bump(p) : p)));
      setReply('');
      setReplyFile(null);
      setReplyPreview(null);
    } catch (e) {
      if (uploaded) deleteImage(uploaded);
      notify('error', friendlyError(e, 'Your comment could not be posted.'));
    } finally {
      setSending(false);
    }
  };

  const saveCommentEdit = async () => {
    if (!editingComment || !uid) return;
    const text = editingComment.text.trim();
    if (!text) { notify('error', 'A comment cannot be empty.'); return; }
    const { data, error } = await supabase.from('forum_comments').update({ content: text }).eq('id', editingComment.id).eq('user_id', uid).select(COMMENT_COLUMNS).maybeSingle();
    if (error || !data) { notify('error', error ? friendlyError(error) : 'You can only edit your own comments.'); return; }
    setComments((prev) => prev.map((c) => (c.id === editingComment.id ? { ...c, content: String((data as any).content ?? text) } : c)));
    setEditingComment(null);
  };

  // ---------------------------------------------------------------- notifications
  useEffect(() => {
    if (!uid) return;
    fetchForumUnreadCount().then(setUnreadCount);
  }, [uid, setUnreadCount]);

  const openNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (!next || !uid) return;
    setNotifLoading(true);
    const { data, error } = await supabase.from('notifications').select('id,type,post_id,source_user_id,created_at,is_read').eq('user_id', uid).order('created_at', { ascending: false }).limit(30);
    setNotifLoading(false);
    if (error) { notify('error', friendlyError(error, 'Could not load notifications.')); return; }
    const rows = (data || []) as NotificationRow[];
    setNotifs(rows);
    loadAuthors(rows.map((r) => r.source_user_id));
    const postIds = Array.from(new Set(rows.map((r) => r.post_id).filter((id): id is string => !!id && !(id in notifTitles))));
    if (postIds.length) {
      const { data: pd } = await supabase.from('forum_posts').select('id,title').in('id', postIds);
      setNotifTitles((prev) => ({ ...prev, ...Object.fromEntries((pd || []).map((p: any) => [p.id, p.title])) }));
    }
  };

  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNotifOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); document.removeEventListener('keydown', onKey); };
  }, [notifOpen]);

  const openNotification = async (n: NotificationRow) => {
    setNotifOpen(false);
    if (!n.is_read) {
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnreadCount(Math.max(0, unread - 1));
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
      if (error) fetchForumUnreadCount().then(setUnreadCount);
    }
    if (n.post_id) onNavigate(n.post_id);
  };

  const markAllRead = async () => {
    if (!uid) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', uid).eq('is_read', false);
    if (error) { notify('error', friendlyError(error)); return; }
    setNotifs((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnreadCount(0);
  };

  // ---------------------------------------------------------------- render pieces
  const ownerMenu = (kind: 'post' | 'comment', row: Post | Comment) => {
    const mine = row.user_id === uid;
    return (
      <ActionMenu
        label={`${kind === 'post' ? 'Post' : 'Comment'} actions`}
        items={mine ? [
          { label: 'Edit', icon: <EditIcon />, onSelect: () => (kind === 'post' ? openEditPost(row as Post) : setEditingComment({ id: row.id, text: row.content })) },
          { label: 'Delete', icon: <TrashIcon />, destructive: true, onSelect: () => setConfirm({ kind, id: row.id, imageUrl: row.image_url }) },
        ] : [
          { label: 'Report', icon: <FlagIcon />, onSelect: () => { setReportReason('Spam or advertising'); setReport({ kind, id: row.id }); } },
        ]}
      />
    );
  };

  const bell = (
    <div className="relative" ref={notifRef}>
      <button type="button" className="btn btn-outline relative h-10 w-10 p-0" onClick={openNotifications} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={notifOpen}>
        <BellIcon className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {notifOpen && (
        <div className="absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift animate-zoom-in">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unread > 0 && <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={markAllRead}>Mark all as read</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {notifLoading ? <div className="p-4"><SkeletonList rows={3} /></div> : notifs.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet. Likes and comments on your posts show up here.</p>
            ) : (
              <ul className="divide-y divide-border">
                {notifs.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => openNotification(n)} className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-muted ${n.is_read ? '' : 'bg-primary/5'}`}>
                      <Avatar author={n.source_user_id ? authors[n.source_user_id] : undefined} size="md" />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-semibold text-foreground">{n.source_user_id ? authors[n.source_user_id]?.name || 'A member' : 'Someone'}</span>
                        <span className="text-muted-foreground"> {n.type === 'like' ? 'liked your post' : n.type === 'comment' ? 'commented on your post' : n.type === 'comment_like' ? 'liked your comment' : 'interacted with your post'}</span>
                        {n.post_id && notifTitles[n.post_id] && <span className="block truncate text-xs font-medium text-primary">“{notifTitles[n.post_id]}”</span>}
                        <span className="block text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                      </span>
                      {!n.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const postCard = (p: Post) => {
    const hasMedia = isTrustedImage(p.image_url) || !!getYouTubeId(p.youtube_url);
    return (
      <article key={p.id} className="card flex gap-1 p-2 transition hover:border-primary/30 sm:gap-3 sm:p-3">
        <VoteControl score={p.upvotes - p.downvotes} vote={p.userVote} onVote={(v) => votePost(p, v)} busy={voting[p.id]} size="sm" />
        <div className="min-w-0 flex-1 py-1 pr-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {tab === 'My Posts' && <span className="badge badge-primary">{p.category}</span>}
              <span className="inline-flex min-w-0 items-center gap-1.5"><Avatar author={authors[p.user_id]} /><span className="truncate font-medium text-foreground">{authorName(p.user_id)}</span></span>
              <span>·</span>
              <time dateTime={p.created_at} title={new Date(p.created_at).toLocaleString()}>{timeAgo(p.created_at)}</time>
            </div>
            <div className="-mr-1 -mt-1 shrink-0">{ownerMenu('post', p)}</div>
          </div>
          <div className="mt-1">
            <ExpandableText as="h3" text={p.title} clampClass="line-clamp-3" className="break-words text-base font-semibold leading-snug text-foreground hover:text-primary" onOpen={() => onNavigate(p.id)} />
            {p.content && <ExpandableText as="p" text={p.content} clampClass="line-clamp-4" className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground" onOpen={() => onNavigate(p.id)} focusable={false} />}
            {hasMedia && (
              <button type="button" onClick={() => onNavigate(p.id)} tabIndex={-1} className="block w-full text-left">
                {isTrustedImage(p.image_url) ? (
                  <img src={p.image_url} alt="" loading="lazy" className="mt-3 max-h-72 w-full rounded-xl border border-border object-cover" />
                ) : (
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-foreground"><PlayIcon className="h-3.5 w-3.5" /> Video</span>
                )}
              </button>
            )}
          </div>
          <button type="button" onClick={() => onNavigate(p.id)} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <MessageCircleIcon className="h-4 w-4" /> {p.comment_count} comment{p.comment_count === 1 ? '' : 's'}
          </button>
        </div>
      </article>
    );
  };

  const renderList = () => (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Forum sections">
          {([...CATEGORIES, 'My Posts'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${tab === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>{t}</button>
          ))}
        </div>
        <Segmented<SortKey> size="sm" ariaLabel="Sort posts" value={sort} onChange={setSort} options={[{ value: 'newest', label: 'Newest' }, { value: 'popular', label: 'Top' }]} />
      </div>
      <p className="text-sm text-muted-foreground">{TAB_HELP[tab]}</p>
      <InlineError onRetry={() => loadPosts(0)}>{listError}</InlineError>
      {listLoading ? (
        <SkeletonList rows={4} />
      ) : posts.length === 0 && !listError ? (
        <EmptyState
          icon={<MessageSquareIcon />}
          title={tab === 'My Posts' ? "You haven't posted yet" : `No posts in ${tab} yet`}
          description={tab === 'My Posts' ? 'Ask a question or share a project with other contractors.' : 'Be the first to start a conversation.'}
          action={<button type="button" className="btn btn-primary" onClick={openNewPost}><PlusIcon className="h-4 w-4" /> New post</button>}
        />
      ) : (
        <>
          <div className="space-y-3">{posts.map(postCard)}</div>
          {hasMore && (
            <div className="flex justify-center">
              <button type="button" className="btn btn-outline" onClick={() => loadPosts(posts.length)} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more posts'}</button>
            </div>
          )}
        </>
      )}
    </div>
  );

  const commentItem = (c: Comment) => {
    const isEditing = editingComment?.id === c.id;
    return (
      <li key={c.id} className="flex gap-2 sm:gap-3">
        <Avatar author={authors[c.user_id]} size="md" />
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl border border-border bg-card px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 text-xs text-muted-foreground"><span className="font-semibold text-foreground">{authorName(c.user_id)}</span> · <time dateTime={c.created_at}>{timeAgo(c.created_at)}</time></div>
              <div className="-mr-2 -mt-2 shrink-0">{ownerMenu('comment', c)}</div>
            </div>
            {isEditing ? (
              <div className="mt-2 space-y-2">
                <textarea className="input min-h-[80px]" value={editingComment!.text} onChange={(e) => setEditingComment({ id: c.id, text: e.target.value })} maxLength={5000} autoFocus aria-label="Edit comment" />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-ghost btn-sm h-9" onClick={() => setEditingComment(null)}>Cancel</button>
                  <button type="button" className="btn btn-primary btn-sm h-9" onClick={saveCommentEdit}>Save</button>
                </div>
              </div>
            ) : (
              c.content && <LinkifiedText text={c.content} className="mt-1 text-sm text-foreground" />
            )}
            {isTrustedImage(c.image_url) && <img src={c.image_url} alt="" loading="lazy" className="mt-2 max-h-64 rounded-xl border border-border object-contain" />}
          </div>
          <div className="mt-1"><VoteControl vertical={false} size="sm" score={c.upvotes - c.downvotes} vote={c.userVote} onVote={(v) => voteComment(c, v)} busy={voting[c.id]} /></div>
        </div>
      </li>
    );
  };

  const renderDetail = () => {
    if (detailState === 'loading' && !detail) return <div className="mx-auto max-w-3xl"><SkeletonList rows={3} /></div>;
    if (detailState === 'missing' || detailState === 'error' || !detail) {
      return (
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={<MessageSquareIcon />}
            title={detailState === 'error' ? 'This post could not be loaded' : 'Post not found'}
            description={detailState === 'error' ? 'Check your connection and try again.' : 'It may have been deleted by its author or hidden by moderators.'}
            action={<button type="button" className="btn btn-primary" onClick={() => onNavigate(null)}>Back to the forum</button>}
          />
        </div>
      );
    }
    const p = detail;
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <article className="card card-pad">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="badge badge-primary">{p.category}</span>
              <span className="inline-flex items-center gap-1.5"><Avatar author={authors[p.user_id]} /><span className="font-medium text-foreground">{authorName(p.user_id)}</span></span>
              <span>·</span>
              <time dateTime={p.created_at} title={new Date(p.created_at).toLocaleString()}>{timeAgo(p.created_at)}</time>
            </div>
            <div className="-mr-2 -mt-2 shrink-0">{ownerMenu('post', p)}</div>
          </div>
          <h2 className="mt-3 break-words text-xl font-bold leading-tight text-foreground sm:text-2xl">{p.title}</h2>
          {p.content && <LinkifiedText text={p.content} className="mt-3 text-[15px] leading-relaxed text-foreground" />}
          {(isTrustedImage(p.image_url) || getYouTubeId(p.youtube_url)) && (
            <div className="mt-4 space-y-3">
              {isTrustedImage(p.image_url) && <img src={p.image_url} alt="" className="w-full rounded-xl border border-border" />}
              <YouTubeEmbed url={p.youtube_url} />
            </div>
          )}
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
            <VoteControl vertical={false} score={p.upvotes - p.downvotes} vote={p.userVote} onVote={(v) => votePost(p, v)} busy={voting[p.id]} />
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><MessageCircleIcon className="h-4 w-4" />{p.comment_count} comment{p.comment_count === 1 ? '' : 's'}</span>
          </div>
        </article>

        <section aria-label="Comments" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">Comments</h3>
            <Segmented<CommentSort> size="sm" ariaLabel="Sort comments" value={commentSort} onChange={setCommentSort} options={[{ value: 'oldest', label: 'Oldest' }, { value: 'newest', label: 'Newest' }, { value: 'top', label: 'Top' }]} />
          </div>
          {commentsLoading && !comments.length ? <SkeletonList rows={2} /> : comments.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
          ) : (
            <ul className="space-y-3">{comments.map(commentItem)}</ul>
          )}
          {commentsMore && (
            <div className="flex justify-center"><button type="button" className="btn btn-outline btn-sm h-10" onClick={() => loadComments(p.id, comments.length)} disabled={commentsLoading}>{commentsLoading ? 'Loading…' : 'Load more comments'}</button></div>
          )}
        </section>

        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-border bg-background/95 px-4 pb-3 pt-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-3 md:bottom-0 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {replyPreview && (
            <div className="relative mb-2 inline-block">
              <img src={replyPreview} alt="Attachment preview" className="h-20 w-20 rounded-xl border border-border object-cover" />
              <button type="button" aria-label="Remove image" onClick={() => { setReplyFile(null); setReplyPreview(null); }} className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background"><XIcon className="h-4 w-4" /></button>
            </div>
          )}
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); sendComment(); }}>
            <input ref={replyFileRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(e) => { pickImage(e.target.files?.[0], (f, prev) => { setReplyFile(f); setReplyPreview(prev); }); e.target.value = ''; }} />
            <button type="button" className="btn btn-outline h-11 w-11 shrink-0 p-0" aria-label="Attach a photo" onClick={() => replyFileRef.current?.click()} disabled={sending}><UploadImageIcon className="h-5 w-5" /></button>
            <CameraButton className="btn btn-outline h-11 w-11 shrink-0 p-0" ariaLabel="Take a photo" disabled={sending} onPhoto={(file) => pickImage(file, (f, prev) => { setReplyFile(f); setReplyPreview(prev); })}>
              <CameraIcon className="h-5 w-5" />
            </CameraButton>
            <label htmlFor="forum-reply" className="sr-only">Write a comment</label>
            <textarea
              id="forum-reply"
              className="input max-h-40 min-h-[44px] flex-1 resize-none py-2.5"
              rows={1}
              value={reply}
              onChange={(e) => { setReply(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isMobile && !e.nativeEvent.isComposing) { e.preventDefault(); sendComment(); } }}
              placeholder="Add a comment…"
              maxLength={5000}
              disabled={sending}
            />
            <button type="submit" className="btn btn-primary h-11 shrink-0 px-3 sm:px-4" disabled={sending || (!reply.trim() && !replyFile)} aria-label="Post comment">
              <SendIcon className="h-4 w-4" /><span className="hidden sm:inline">{sending ? 'Posting…' : 'Post'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  };

  const draftPreview = draft?.preview || draft?.imageUrl || null;

  return (
    <div className="page">
      <PageHeader
        onBack={initialPostId ? () => onNavigate(null) : onBack}
        backLabel={initialPostId ? 'Back to the forum' : 'Back'}
        icon={<MessageSquareIcon className="h-7 w-7" />}
        title="Community"
        subtitle={initialPostId ? 'Discussion' : 'Ask questions, share projects and suggest features.'}
        actions={<>{bell}<button type="button" className="btn btn-primary" onClick={openNewPost}><PlusIcon className="h-4 w-4" /> New post</button></>}
      />

      {initialPostId ? renderDetail() : renderList()}

      <Modal
        open={!!draft}
        onClose={closeDraft}
        busy={savingPost || draftCameraOpen}
        size="lg"
        title={draft?.id ? 'Edit post' : 'New post'}
        description="Posts are visible to every ContractorDocs member."
        footer={<><button type="button" className="btn btn-outline" onClick={closeDraft} disabled={savingPost}>Cancel</button><button type="button" className="btn btn-primary" onClick={savePost} disabled={savingPost}>{savingPost ? 'Saving…' : draft?.id ? 'Save changes' : 'Publish'}</button></>}
      >
        {draft && (
          <div className="space-y-4">
            {draftError && <InlineError>{draftError}</InlineError>}
            <Field label="Section" htmlFor="fp-cat">
              <select id="fp-cat" className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Title" htmlFor="fp-title" hint={`${draft.title.length}/150`}>
              <input id="fp-title" className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="What's your question or project?" maxLength={150} autoFocus />
            </Field>
            <Field label="Details" htmlFor="fp-content">
              <textarea id="fp-content" className="input min-h-[140px] resize-y" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Add context, measurements, what you've tried…" maxLength={10000} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="label">Photo</span>
                {draftPreview ? (
                  <div className="relative overflow-hidden rounded-xl border border-border">
                    <img src={draftPreview} alt="Post photo" className="max-h-48 w-full object-cover" />
                    <button type="button" aria-label="Remove photo" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive" onClick={() => { if (draft.preview) URL.revokeObjectURL(draft.preview); setDraft({ ...draft, file: null, preview: null, imageUrl: null }); }}>
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground">
                      <UploadImageIcon className="h-6 w-6" /> Add a photo
                      <input type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={(e) => { pickImage(e.target.files?.[0], (f, prev) => setDraft((d) => (d ? { ...d, file: f, preview: prev } : d))); e.target.value = ''; }} />
                    </label>
                    <CameraButton
                      className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      onOpenChange={setDraftCameraOpen}
                      onPhoto={(file) => pickImage(file, (f, prev) => setDraft((d) => (d ? { ...d, file: f, preview: prev } : d)))}
                    >
                      <CameraIcon className="h-6 w-6" /> Take a photo
                    </CameraButton>
                  </div>
                )}
              </div>
              <Field label="YouTube link (optional)" htmlFor="fp-yt" error={draft.youtube.trim() && !getYouTubeId(draft.youtube) ? 'Paste a youtube.com or youtu.be link.' : undefined}>
                <input id="fp-yt" className="input" value={draft.youtube} onChange={(e) => setDraft({ ...draft, youtube: e.target.value })} placeholder="https://youtu.be/…" inputMode="url" />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!report}
        onClose={() => setReport(null)}
        busy={reportBusy}
        size="sm"
        title={`Report this ${report?.kind ?? 'post'}`}
        description="Reports are anonymous. Content reported by several members is hidden until reviewed."
        footer={<><button type="button" className="btn btn-outline" onClick={() => setReport(null)} disabled={reportBusy}>Cancel</button><button type="button" className="btn btn-danger" onClick={sendReport} disabled={reportBusy}>{reportBusy ? 'Sending…' : 'Send report'}</button></>}
      >
        <fieldset className="space-y-1">
          <legend className="sr-only">Reason</legend>
          {['Spam or advertising', 'Harassment or hate', 'Inappropriate content', 'Scam or fraud', 'Something else'].map((r) => (
            <label key={r} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 text-sm hover:bg-muted">
              <input type="radio" name="report-reason" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={reportReason === r} onChange={() => setReportReason(r)} />
              {r}
            </label>
          ))}
        </fieldset>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'post' ? 'Delete this post?' : 'Delete this comment?'}
        message={confirm?.kind === 'post' ? 'The post and all its comments will be removed for everyone. This cannot be undone.' : 'The comment will be removed for everyone. This cannot be undone.'}
        confirmLabel="Delete"
        destructive
        busy={confirmBusy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
      <NoticeToast notice={notice} onClose={clear} />
    </div>
  );
};

export default ForumView;
