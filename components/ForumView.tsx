import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { Input } from './ui/Input.tsx';
import { Label } from './ui/Label.tsx';
import { BackArrowIcon, MessageSquareIcon, ThumbsUpIcon, ThumbsDownIcon, MessageCircleIcon, SendIcon, UploadImageIcon, XCircleIcon, CameraIcon, ClockIcon, TrendingUpIcon, PlayIcon, PenIcon, TrashIcon, BellIcon } from './Icons.tsx';
import { compressImage } from '../utils/imageCompression.ts';

interface ForumViewProps {
  onBack: () => void;
  supabase: any;
  session: any;
  onUploadImage: (file: File) => Promise<string>;
  initialPostId?: string;
  onNavigate: (postId: string | null) => void;
  onDbSetupNeeded: () => void;
}

interface Post {
  id: string;
  title: string;
  content: string;
  category: string;
  upvotes: number;
  downvotes: number;
  image_url?: string;
  youtube_url?: string;
  created_at: string;
  user_id: string;
  profiles?: { name: string; profile_picture_url: string };
  userVote?: 'up' | 'down' | null;
  comment_count?: number;
  score?: number;
}

interface Comment {
    id: string;
    content: string;
    created_at: string;
    user_id: string;
    image_url?: string;
    profiles?: { name: string; profile_picture_url: string };
    upvotes: number;
    downvotes: number;
    userVote?: 'up' | 'down' | null;
    score?: number;
}

interface NotificationDetail {
    id: string;
    type: 'like' | 'comment';
    post_id: string;
    created_at: string;
    is_read: boolean;
    profiles: { name: string; profile_picture_url: string };
    forum_posts: { title: string };
}

type Category = 'General' | 'Suggestion' | 'Project Showcase' | 'My Posts';
type SortOption = 'newest' | 'popular';

const ForumView: React.FC<ForumViewProps> = ({ onBack, supabase, session, onUploadImage, initialPostId, onNavigate, onDbSetupNeeded }) => {
  const [activeTab, setActiveTab] = useState<Category>('General');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [commentSortBy, setCommentSortBy] = useState<SortOption>('newest');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  
  const [showPostModal, setShowPostModal] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postForm, setPostForm] = useState({ title: '', content: '' });
  const [postVideoLink, setPostVideoLink] = useState('');
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string>('');
  const [postImageSize, setPostImageSize] = useState<string>(''); 
  const [originalImageSize, setOriginalImageSize] = useState<string>(''); 
  const [isPosting, setIsPosting] = useState(false);
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newCommentImage, setNewCommentImage] = useState<File | null>(null);
  const [newCommentImagePreview, setNewCommentImagePreview] = useState<string>('');
  const [isCommenting, setIsCommenting] = useState(false);

  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraMode, setCameraMode] = useState<'post' | 'comment' | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationList, setNotificationList] = useState<NotificationDetail[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationRef = useRef<HTMLDivElement>(null);

  const categoryDescriptions: Record<Category, string> = {
      'General': 'General discussion about the trade. Ask questions, share news, or chat with peers.',
      'Suggestion': 'This is a suggestions forum. Users suggest features to add to the app that they think will be really cool.',
      'Project Showcase': 'Share photos of your latest work and get feedback from the community.',
      'My Posts': 'All posts you have created across different categories.'
  };

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
              setShowNotifications(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotificationCount = async () => {
      if (!session) return;
      const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.user.id)
          .eq('is_read', false);
      setUnreadCount(count || 0);
  };

  useEffect(() => {
      if (session) fetchNotificationCount();
  }, [session]);

  const fetchNotifications = async () => {
      if (!session) return;
      const { data, error } = await supabase
          .from('notifications')
          .select(`
              id, type, post_id, created_at, is_read,
              profiles:source_user_id (name, profile_picture_url),
              forum_posts:post_id (title)
          `)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(20);
      
      if (error) {
          if (error.code === 'PGRST200' || error.message.includes('Could not find a relationship')) {
              onDbSetupNeeded();
          } else {
              console.error("Fetch notif error", error);
          }
      } else if (data) {
          setNotificationList(data);
      }
  };

  const handleToggleNotifications = () => {
      if (!showNotifications) {
          fetchNotifications();
      }
      setShowNotifications(!showNotifications);
  };

  const handleNotificationClick = async (note: NotificationDetail) => {
      if (!note.is_read) {
          await supabase.from('notifications').update({ is_read: true }).eq('id', note.id);
          setUnreadCount(prev => Math.max(0, prev - 1));
          setNotificationList(prev => prev.map(n => n.id === note.id ? { ...n, is_read: true } : n));
      }
      setShowNotifications(false);
      onNavigate(note.post_id);
  };

  const getYouTubeId = (url: string) => {
    if (!url) return null;
    try {
        if (!url.match(/^https?:\/\//)) {
            url = 'https://' + url;
        }
        const parsedUrl = new URL(url);
        let videoId = null;
        if (parsedUrl.hostname === 'youtu.be') {
            videoId = parsedUrl.pathname.slice(1);
        } else if (parsedUrl.hostname.includes('youtube.com')) {
            if (parsedUrl.pathname === '/watch') {
                videoId = parsedUrl.searchParams.get('v');
            } else if (parsedUrl.pathname.startsWith('/embed/') || parsedUrl.pathname.startsWith('/shorts/') || parsedUrl.pathname.startsWith('/v/')) {
                const parts = parsedUrl.pathname.split('/');
                videoId = parts[parts.length - 1];
            }
        }
        if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            return videoId;
        }
    } catch (e) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?\/]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            return match[2];
        }
    }
    return null;
  };

  useEffect(() => {
    if (session) fetchPosts();
  }, [session, activeTab, sortBy]);

  useEffect(() => {
      if (initialPostId) {
          if (selectedPost?.id === initialPostId) return;
          const existing = posts.find(p => p.id === initialPostId);
          if (existing) {
              setSelectedPost(existing);
          } else {
              fetchPostDetails(initialPostId);
          }
      } else {
          setSelectedPost(null);
      }
  }, [initialPostId, posts]);

  useEffect(() => {
      return () => {
          if (postImagePreview) URL.revokeObjectURL(postImagePreview);
          if (newCommentImagePreview) URL.revokeObjectURL(newCommentImagePreview);
      };
  }, [postImagePreview, newCommentImagePreview]);

  useEffect(() => {
      if (selectedPost && session) {
          fetchComments(selectedPost.id);
      }
  }, [commentSortBy, selectedPost?.id]);

  const fetchPostDetails = async (postId: string) => {
      setLoading(true);
      const { data: post, error } = await supabase
        .from('forum_posts')
        .select('*, profiles:user_id(name, profile_picture_url), forum_comments(count)')
        .eq('id', postId)
        .single();
      
      if (post && !error) {
          const { data: vote } = await supabase.from('forum_votes').select('vote_type').eq('post_id', postId).eq('user_id', session.user.id).single();
          
          const formatted = {
              ...post,
              userVote: vote?.vote_type || null,
              score: (post.upvotes || 0) - (post.downvotes || 0),
              comment_count: post.forum_comments ? post.forum_comments[0]?.count : 0
          };
          setSelectedPost(formatted);
      }
      setLoading(false);
  };

  const fetchPosts = async () => {
      setLoading(true);
      let query = supabase.from('forum_posts').select(`*, profiles:user_id (name, profile_picture_url), forum_comments (count)`);
      if (activeTab === 'My Posts') query = query.eq('user_id', session.user.id);
      else query = query.eq('category', activeTab);

      if (sortBy === 'newest') query = query.order('created_at', { ascending: false });
      else query = query.order('upvotes', { ascending: false });

      const { data: postsData, error: postsError } = await query;
      if (postsError) {
          setLoading(false);
          return;
      }

      const { data: votesData } = await supabase.from('forum_votes').select('post_id, vote_type').eq('user_id', session.user.id);
      const votesMap = new Map();
      if (votesData) votesData.forEach((v: any) => votesMap.set(v.post_id, v.vote_type));

      const formattedPosts = (postsData || []).map((p: any) => ({
          ...p,
          userVote: votesMap.get(p.id) || null,
          score: (p.upvotes || 0) - (p.downvotes || 0),
          comment_count: p.forum_comments ? p.forum_comments[0]?.count : 0
      }));

      if (sortBy === 'popular') formattedPosts.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
      else formattedPosts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setPosts(formattedPosts);
      setLoading(false);
  };

  const fetchComments = async (postId: string) => {
      const { data: commentsData, error } = await supabase.from('forum_comments').select('*, profiles:user_id(name, profile_picture_url)').eq('post_id', postId);
      if (error) return;

      const { data: votesData } = await supabase.from('forum_comment_votes').select('comment_id, vote_type').eq('user_id', session.user.id).in('comment_id', commentsData.map((c: any) => c.id));
      const votesMap = new Map();
      if (votesData) votesData.forEach((v: any) => votesMap.set(v.comment_id, v.vote_type));

      let formattedComments = commentsData.map((c: any) => ({
          ...c,
          upvotes: c.upvotes || 0,
          downvotes: c.downvotes || 0,
          userVote: votesMap.get(c.id) || null,
          score: (c.upvotes || 0) - (c.downvotes || 0)
      }));

      if (commentSortBy === 'newest') formattedComments.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      else formattedComments.sort((a: any, b: any) => b.score - a.score);

      setComments(formattedComments);
  };

  const createNotification = async (recipientId: string, type: 'like' | 'comment', postId: string) => {
      if (recipientId === session.user.id) return;
      try {
          await supabase.from('notifications').insert({ user_id: recipientId, source_user_id: session.user.id, type, post_id: postId, is_read: false });
      } catch (e) { console.error("Failed to send notification", e); }
  };

  const handleVote = async (postId: string, type: 'up' | 'down') => {
      const postIndex = posts.findIndex(p => p.id === postId);
      if (postIndex === -1 && selectedPost?.id !== postId) return;
      
      const post = selectedPost && selectedPost.id === postId ? selectedPost : posts[postIndex];
      const currentVote = post.userVote;
      
      let newUpvotes = post.upvotes;
      let newDownvotes = post.downvotes;

      if (currentVote === type) {
          if (type === 'up') newUpvotes--;
          else newDownvotes--;
          await supabase.from('forum_votes').delete().match({ post_id: postId, user_id: session.user.id });
          const updatedPost = { ...post, upvotes: newUpvotes, downvotes: newDownvotes, userVote: null, score: newUpvotes - newDownvotes };
          if (selectedPost?.id === postId) setSelectedPost(updatedPost);
          if (postIndex !== -1) {
              const newPosts = [...posts];
              newPosts[postIndex] = updatedPost;
              if (sortBy === 'popular') newPosts.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
              setPosts(newPosts);
          }
      } else {
          if (currentVote === 'up') newUpvotes--;
          if (currentVote === 'down') newDownvotes--;
          if (type === 'up') { newUpvotes++; createNotification(post.user_id, 'like', post.id); }
          else newDownvotes++;
          await supabase.from('forum_votes').upsert({ post_id: postId, user_id: session.user.id, vote_type: type }, { onConflict: 'post_id, user_id' });
          const updatedPost = { ...post, upvotes: newUpvotes, downvotes: newDownvotes, userVote: type, score: newUpvotes - newDownvotes };
          if (selectedPost?.id === postId) setSelectedPost(updatedPost);
          if (postIndex !== -1) {
              const newPosts = [...posts];
              newPosts[postIndex] = updatedPost;
              if (sortBy === 'popular') newPosts.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
              setPosts(newPosts);
          }
      }
      await supabase.from('forum_posts').update({ upvotes: newUpvotes, downvotes: newDownvotes }).eq('id', postId);
  };

  const handleCommentVote = async (commentId: string, type: 'up' | 'down') => {
      const commentIndex = comments.findIndex(c => c.id === commentId);
      if (commentIndex === -1) return;
      const comment = comments[commentIndex];
      const currentVote = comment.userVote;
      const newComments = [...comments];
      let newUpvotes = comment.upvotes;
      let newDownvotes = comment.downvotes;

      if (currentVote === type) {
          if (type === 'up') newUpvotes--;
          else newDownvotes--;
          newComments[commentIndex] = { ...comment, upvotes: newUpvotes, downvotes: newDownvotes, userVote: null, score: newUpvotes - newDownvotes };
          await supabase.from('forum_comment_votes').delete().match({ comment_id: commentId, user_id: session.user.id });
      } else {
          if (currentVote === 'up') newUpvotes--;
          if (currentVote === 'down') newDownvotes--;
          if (type === 'up') newUpvotes++;
          else newDownvotes++;
          newComments[commentIndex] = { ...comment, upvotes: newUpvotes, downvotes: newDownvotes, userVote: type, score: newUpvotes - newDownvotes };
          await supabase.from('forum_comment_votes').upsert({ comment_id: commentId, user_id: session.user.id, vote_type: type }, { onConflict: 'comment_id, user_id' });
      }
      if (commentSortBy === 'popular') newComments.sort((a, b) => (b.score || 0) - (a.score || 0));
      setComments(newComments);
      await supabase.from('forum_comments').update({ upvotes: newUpvotes, downvotes: newDownvotes }).eq('id', commentId);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'post' | 'comment') => {
      if (e.target.files && e.target.files[0]) {
          const originalFile = e.target.files[0];
          if(type === 'post') setOriginalImageSize(`${(originalFile.size / 1024).toFixed(1)} KB`);
          try {
              const compressedFile = await compressImage(originalFile);
              const preview = URL.createObjectURL(compressedFile);
              if (type === 'post') { setPostImage(compressedFile); setPostImagePreview(preview); setPostImageSize(`${(compressedFile.size / 1024).toFixed(1)} KB`); } 
              else { setNewCommentImage(compressedFile); setNewCommentImagePreview(preview); }
          } catch (err) { alert("Could not process image."); }
      }
  };

  const startCamera = async (mode: 'post' | 'comment') => {
      setCameraMode(mode);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return alert("Camera API is not supported.");
      try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (devices.filter(d => d.kind === 'videoinput').length === 0) return alert("No camera found.");
          let stream;
          try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } 
          catch (e) { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
          streamRef.current = stream; setShowCameraModal(true);
      } catch (err: any) { alert("Error accessing camera: " + (err.message || "Unknown error")); }
  };

  const stopCamera = () => {
      if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
      setShowCameraModal(false); setCameraMode(null);
  };

  const videoCallbackRef = useCallback((node: HTMLVideoElement) => {
      videoRef.current = node;
      if (node && streamRef.current) { node.srcObject = streamRef.current; node.play().catch(e => console.log("Play error:", e)); }
  }, [showCameraModal]);

  const capturePhoto = async () => {
      const video = videoRef.current; const canvas = canvasRef.current;
      if (video && canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
              canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0);
              canvas.toBlob(async (blob) => {
                  if (blob) {
                      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
                      try {
                          const compressedFile = await compressImage(file); const preview = URL.createObjectURL(compressedFile);
                          if (cameraMode === 'post') { setPostImage(compressedFile); setPostImagePreview(preview); setOriginalImageSize(`${(file.size / 1024).toFixed(1)} KB`); setPostImageSize(`${(compressedFile.size / 1024).toFixed(1)} KB`); } 
                          else if (cameraMode === 'comment') { setNewCommentImage(compressedFile); setNewCommentImagePreview(preview); }
                          stopCamera();
                      } catch (err) { alert("Could not process photo."); }
                  }
              }, 'image/jpeg', 0.9);
          }
      }
  };

  const resetPostForm = () => { setShowPostModal(false); setEditingPostId(null); setPostForm({ title: '', content: '' }); setPostVideoLink(''); setShowVideoInput(false); setPostImage(null); setPostImagePreview(''); };
  const openNewPostModal = () => { resetPostForm(); setShowPostModal(true); };
  const openEditModal = (post: Post, e?: React.MouseEvent) => { e?.stopPropagation(); setEditingPostId(post.id); setPostForm({ title: post.title, content: post.content }); setPostVideoLink(post.youtube_url || ''); if (post.youtube_url) setShowVideoInput(true); setPostImage(null); setPostImagePreview(''); setShowPostModal(true); };
  const initiateDeletePost = (postId: string, e?: React.MouseEvent) => { e?.stopPropagation(); setPostToDelete(postId); setShowDeleteModal(true); };
  
  const confirmDeletePost = async () => {
      if (!postToDelete) return;
      setLoading(true);
      const { error, count } = await supabase.from('forum_posts').delete({ count: 'exact' }).eq('id', postToDelete);
      if (error) alert("Failed to delete post: " + error.message);
      else if (count === 0) onDbSetupNeeded();
      else { setPosts(prev => prev.filter(p => p.id !== postToDelete)); if (selectedPost?.id === postToDelete) onNavigate(null); }
      setLoading(false); setShowDeleteModal(false); setPostToDelete(null);
  };

  const handleSavePost = async () => {
      if (!postForm.title || !postForm.content) return;
      const cleanVideoLink = postVideoLink.trim();
      if (cleanVideoLink && !getYouTubeId(cleanVideoLink)) return alert("Invalid YouTube URL.");
      setIsPosting(true);
      try {
          if (editingPostId) {
              const { error } = await supabase.from('forum_posts').update({ title: postForm.title, content: postForm.content, youtube_url: cleanVideoLink }).eq('id', editingPostId);
              if (error) throw error;
              setPosts(prev => prev.map(p => p.id === editingPostId ? { ...p, title: postForm.title, content: postForm.content, youtube_url: cleanVideoLink } : p));
              if (selectedPost?.id === editingPostId) setSelectedPost(prev => prev ? { ...prev, title: postForm.title, content: postForm.content, youtube_url: cleanVideoLink } : null);
          } else {
              let imageUrl = null; if (postImage) imageUrl = await onUploadImage(postImage);
              const categoryToSave = activeTab === 'My Posts' ? 'General' : activeTab;
              const { error } = await supabase.from('forum_posts').insert({ user_id: session.user.id, title: postForm.title, content: postForm.content, category: categoryToSave, image_url: imageUrl, youtube_url: cleanVideoLink });
              if (error) throw error;
              await fetchPosts();
          }
          resetPostForm();
      } catch (error: any) { if (error.message.includes('Could not find the \'youtube_url\' column')) { alert("Database update required. Please refresh."); window.location.reload(); } else alert(`Failed to save post: ${error.message}`); } 
      finally { setIsPosting(false); }
  };

  const handleAddComment = async () => {
      if (!newComment.trim() && !newCommentImage) return;
      if (!selectedPost) return;
      setIsCommenting(true);
      let imageUrl = null;
      try {
          if (newCommentImage) imageUrl = await onUploadImage(newCommentImage);
          const { data, error } = await supabase.from('forum_comments').insert({ post_id: selectedPost.id, user_id: session.user.id, content: newComment, image_url: imageUrl }).select('*, profiles:user_id(name, profile_picture_url)').single();
          if (!error && data) {
              const newCommentObj = { ...data, upvotes: 0, downvotes: 0, score: 0, userVote: null };
              setComments([...comments, newCommentObj]); setNewComment(''); setNewCommentImage(null); setNewCommentImagePreview('');
              setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p));
              createNotification(selectedPost.user_id, 'comment', selectedPost.id);
          } else if (error) alert(`Failed to comment: ${error.message}`);
      } catch (e: any) { alert('Error posting comment: ' + e.message); } 
      finally { setIsCommenting(false); }
  };

  const renderVideoEmbed = (videoUrl?: string) => {
      if (!videoUrl) return null;
      const videoId = getYouTubeId(videoUrl);
      if (!videoId) return null;
      return (
          <div className="mb-3 rounded-md overflow-hidden w-full bg-muted relative shadow-sm border border-border">
              <div className="aspect-video relative">
                <iframe key={videoId} className="absolute top-0 left-0 w-full h-full" src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"></iframe>
              </div>
              <div className="bg-card p-2 text-xs text-center border-t border-border"><a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center justify-center gap-2"><PlayIcon className="w-3 h-3" /> Watch directly on YouTube (if playback disabled)</a></div>
          </div>
      );
  };

  const toggleExpansion = (postId: string, type: 'title' | 'content', e: React.MouseEvent) => { e.stopPropagation(); setExpandedItems(prev => ({ ...prev, [`${postId}-${type}`]: !prev[`${postId}-${type}`] })); };

  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col p-4 md:p-8 pb-24 relative">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
         <div className="flex items-center w-full sm:w-auto">
             <Button variant="ghost" size="sm" onClick={selectedPost ? () => onNavigate(null) : onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full shrink-0" aria-label="Back">
                <BackArrowIcon className="h-6 w-6" />
            </Button>
            <div className="flex-1">
                <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight truncate">
                    Community Forum
                </h1>
            </div>
         </div>
         
         {!selectedPost && (
             <div className="flex items-center gap-3 self-end sm:self-auto">
                 <div className="relative" ref={notificationRef}>
                     <Button variant="ghost" size="icon" className="rounded-full relative hover:bg-secondary" onClick={handleToggleNotifications}>
                         <BellIcon className="w-6 h-6" />
                         {unreadCount > 0 && <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold shadow-sm ring-2 ring-background">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                     </Button>
                     {showNotifications && (
                         <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95">
                             <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30"><h3 className="font-semibold text-sm">Notifications</h3><button onClick={() => setShowNotifications(false)} className="text-muted-foreground hover:text-foreground p-1"><XCircleIcon className="w-4 h-4" /></button></div>
                             <div className="max-h-[60vh] overflow-y-auto">
                                 {notificationList.length === 0 ? <div className="p-8 text-center text-muted-foreground text-sm">No notifications yet.</div> : <div className="divide-y divide-border">{notificationList.map(note => (
                                             <div key={note.id} className={`p-3 flex gap-3 cursor-pointer transition-colors hover:bg-muted/50 ${!note.is_read ? 'bg-primary/5' : ''}`} onClick={() => handleNotificationClick(note)}>
                                                 <div className="shrink-0 pt-1">{note.profiles?.profile_picture_url ? <img src={note.profiles.profile_picture_url} className="w-8 h-8 rounded-full object-cover border border-border" alt="avatar" /> : <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-border"><span className="text-xs font-bold">{note.profiles?.name?.charAt(0) || '?'}</span></div>}</div>
                                                 <div className="flex-1 min-w-0"><p className="text-sm text-foreground"><span className="font-semibold">{note.profiles?.name || 'Someone'}</span><span className="text-muted-foreground"> {note.type === 'like' ? 'liked your post' : 'commented on your post'}:</span></p><p className="text-xs font-medium text-primary truncate mt-0.5">"{note.forum_posts?.title}"</p><p className="text-[10px] text-muted-foreground mt-1">{new Date(note.created_at).toLocaleDateString()} at {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>
                                                 {!note.is_read && <div className="self-center"><div className="w-2 h-2 rounded-full bg-blue-500"></div></div>}
                                             </div>
                                         ))}</div>}
                             </div>
                         </div>
                     )}
                 </div>
                 <Button onClick={openNewPostModal} className="shadow-md shadow-primary/20 rounded-full px-6">+ New Post</Button>
             </div>
         )}
      </header>

      {/* Camera Modal */}
      {showCameraModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={stopCamera}>
                <Card className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
                    <CardHeader><CardTitle>Take Photo</CardTitle></CardHeader>
                    <CardContent><video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-auto max-h-[60vh] rounded-md bg-black" /><canvas ref={canvasRef} className="hidden" /></CardContent>
                    <CardFooter className="flex justify-end gap-2"><Button variant="outline" onClick={stopCamera}>Cancel</Button><Button onClick={capturePhoto}><CameraIcon className="w-4 h-4 mr-2" /> Capture</Button></CardFooter>
                </Card>
            </div>
      )}
      {/* Delete Modal */}
      {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowDeleteModal(false)}>
              <Card className="w-full max-w-sm animate-in fade-in zoom-in-95 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <CardHeader><CardTitle>Delete Post</CardTitle><CardDescription>Are you sure you want to delete this post?</CardDescription></CardHeader>
                  <CardFooter className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowDeleteModal(false)}>No</Button><Button variant="destructive" onClick={confirmDeletePost}>Yes, Delete</Button></CardFooter>
              </Card>
          </div>
      )}

      {/* Content */}
      {!selectedPost ? (
          <div className="max-w-4xl mx-auto w-full space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex gap-2 overflow-x-auto p-2 pb-2 no-scrollbar">
                      {(['General', 'Suggestion', 'Project Showcase', 'My Posts'] as Category[]).map((tab) => (
                          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${activeTab === tab ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 transform scale-105' : 'bg-card border border-border text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>{tab}</button>
                      ))}
                  </div>
                  <div className="flex items-center gap-2 bg-card border border-border p-1 rounded-full self-start sm:self-auto shadow-sm">
                      <button onClick={() => setSortBy('newest')} className={`px-4 py-1.5 text-xs font-bold rounded-full flex items-center gap-1.5 transition-all ${sortBy === 'newest' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-muted'}`}><ClockIcon className="w-3.5 h-3.5" /> Newest</button>
                      <button onClick={() => setSortBy('popular')} className={`px-4 py-1.5 text-xs font-bold rounded-full flex items-center gap-1.5 transition-all ${sortBy === 'popular' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-muted'}`}><TrendingUpIcon className="w-3.5 h-3.5" /> Popular</button>
                  </div>
              </div>

              <div className="bg-card text-foreground px-6 py-4 rounded-2xl border border-border flex items-center gap-4 shadow-sm">
                  <div className="p-2 bg-secondary rounded-full shadow-sm"><MessageCircleIcon className="w-6 h-6 text-primary" /></div>
                  <p className="text-sm font-medium leading-relaxed text-muted-foreground">{categoryDescriptions[activeTab]}</p>
              </div>

              <div className="space-y-4">
                  {loading ? <div className="text-center py-10 text-muted-foreground">Loading community...</div> : posts.length === 0 ? <div className="text-center py-10 bg-card rounded-lg border border-border"><p className="text-muted-foreground">No posts here yet.</p></div> : (
                      posts.map(post => {
                          const isContentExpanded = expandedItems[`${post.id}-content`];
                          const isTitleExpanded = expandedItems[`${post.id}-title`];
                          const isLongContent = post.content.length > 200 || (post.content.match(/\n/g) || []).length > 2;
                          const isLongTitle = post.title.length > 100;

                          return (
                            <Card key={post.id} className="hover:shadow-lg hover:border-primary/30 transition-all duration-300 cursor-pointer overflow-hidden animate-fade-in-down border-gray-400 dark:border-gray-600 group bg-card" onClick={() => onNavigate(post.id)}>
                                <div className="flex">
                                    <div className="flex flex-col items-center p-4 border-r border-border gap-1 min-w-[60px]" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => handleVote(post.id, 'up')} className={`p-1.5 rounded-lg transition-colors hover:bg-white/50 dark:hover:bg-background ${post.userVote === 'up' ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'text-muted-foreground'}`}>
                                            <ThumbsUpIcon className="w-5 h-5" />
                                        </button>
                                        <span className={`text-sm font-bold font-mono my-1 ${post.score && post.score > 0 ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>{post.score}</span>
                                        <button onClick={() => handleVote(post.id, 'down')} className={`p-1.5 rounded-lg transition-colors hover:bg-white/50 dark:hover:bg-background ${post.userVote === 'down' ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-muted-foreground'}`}>
                                            <ThumbsDownIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="flex-1 p-5 min-w-0">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1 pr-2 min-w-0">
                                                <h3 
                                                    className={`text-lg font-bold break-words whitespace-normal mb-1 group-hover:text-primary transition-colors ${!isTitleExpanded && isLongTitle ? 'line-clamp-3' : ''}`}
                                                    style={!isTitleExpanded && isLongTitle ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}}
                                                >
                                                    {post.title}
                                                </h3>
                                                {isLongTitle && <button onClick={(e) => toggleExpansion(post.id, 'title', e)} className="text-xs text-primary hover:underline font-medium focus:outline-none mb-2 block">{isTitleExpanded ? 'Show Less' : 'Show More'}</button>}
                                            </div>
                                            {session.user.id === post.user_id && (
                                                <div className="flex gap-1 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                    <button onClick={(e) => openEditModal(post, e)} className="text-muted-foreground hover:text-primary p-1.5 rounded-md hover:bg-secondary"><PenIcon className="w-4 h-4" /></button>
                                                    <button onClick={(e) => initiateDeletePost(post.id, e)} className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-secondary"><TrashIcon className="w-4 h-4" /></button>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <p className={`text-sm text-muted-foreground mb-3 whitespace-pre-wrap break-words leading-relaxed ${!isContentExpanded && isLongContent ? 'line-clamp-3' : ''}`}>
                                            {post.content}
                                        </p>
                                        {isLongContent && <button onClick={(e) => toggleExpansion(post.id, 'content', e)} className="text-xs text-primary hover:underline mb-4 font-medium focus:outline-none">{isContentExpanded ? 'Show Less' : 'Show More'}</button>}
                                        
                                        {renderVideoEmbed(post.youtube_url)}

                                        {post.image_url && !post.youtube_url && (
                                            <div className="mb-4 rounded-xl overflow-hidden w-full bg-secondary/50 border border-border">
                                                <img src={post.image_url} alt="Post attachment" className="w-full h-auto max-h-[400px] object-contain" />
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                                            <div className="flex items-center gap-2">
                                                {post.profiles?.profile_picture_url ? <img src={post.profiles.profile_picture_url} className="w-6 h-6 rounded-full object-cover border border-border" alt="avatar" /> : <div className="w-6 h-6 bg-secondary rounded-full border border-border" />}
                                                <span className="font-medium text-foreground">{post.profiles?.name || 'Unknown'}</span>
                                                <span>•</span>
                                                <span>{new Date(post.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 bg-white/50 dark:bg-secondary/50 px-2 py-1 rounded-md">
                                                <MessageCircleIcon className="w-3.5 h-3.5" />
                                                <span className="font-medium">{post.comment_count || 0} Comments</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                          );
                      })
                  )}
              </div>
          </div>
      ) : (
          <div className="max-w-4xl mx-auto w-full flex flex-col animate-in fade-in">
              <div className="space-y-6 pb-24">
                  <Card className="border-0 shadow-none bg-transparent">
                      <div className="flex bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                          <div className="flex flex-col items-center p-4 border-r border-border gap-2 min-w-[70px]">
                              <button onClick={() => handleVote(selectedPost.id, 'up')} className={`p-2 rounded-xl transition-all hover:bg-white/50 dark:hover:bg-background hover:scale-110 ${selectedPost.userVote === 'up' ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-sm' : 'text-muted-foreground'}`}>
                                  <ThumbsUpIcon className="w-6 h-6" />
                              </button>
                              <div className={`text-xl font-bold font-mono ${selectedPost.score && selectedPost.score > 0 ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>{(selectedPost.upvotes - selectedPost.downvotes)}</div>
                              <button onClick={() => handleVote(selectedPost.id, 'down')} className={`p-2 rounded-xl transition-all hover:bg-white/50 dark:hover:bg-background hover:scale-110 ${selectedPost.userVote === 'down' ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm' : 'text-muted-foreground'}`}>
                                  <ThumbsDownIcon className="w-6 h-6" />
                              </button>
                          </div>
                          <div className="flex-1 p-6 min-w-0">
                              <div className="flex justify-between items-start mb-4">
                                  <div className="flex items-center gap-2 text-xs">
                                      <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary font-bold uppercase tracking-wide">{selectedPost.category}</span>
                                      <span className="text-muted-foreground">• Posted by <span className="font-medium text-foreground">{selectedPost.profiles?.name || 'User'}</span></span>
                                      <span className="text-muted-foreground">• {new Date(selectedPost.created_at).toLocaleDateString()}</span>
                                  </div>
                                  {session.user.id === selectedPost.user_id && (
                                      <div className="flex gap-2 shrink-0">
                                          <Button variant="ghost" size="sm" onClick={(e) => openEditModal(selectedPost, e)} className="h-8"><PenIcon className="w-4 h-4 mr-2" /> Edit</Button>
                                          <Button variant="ghost" size="sm" onClick={(e) => initiateDeletePost(selectedPost.id, e)} className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"><TrashIcon className="w-4 h-4 mr-2" /> Delete</Button>
                                      </div>
                                  )}
                              </div>
                              <h2 className="text-3xl font-bold mb-6 break-words leading-tight text-foreground">{selectedPost.title}</h2>
                              <p className="text-foreground whitespace-pre-wrap leading-loose mb-8 break-words text-base">{selectedPost.content}</p>
                              
                              {renderVideoEmbed(selectedPost.youtube_url)}

                              {selectedPost.image_url && (
                                  <div className="rounded-xl overflow-hidden border border-border mb-6 shadow-sm">
                                      <img src={selectedPost.image_url} alt="Post content" className="w-full h-auto" />
                                  </div>
                              )}
                          </div>
                      </div>
                  </Card>

                  <div className="space-y-6 pl-4 lg:pl-0">
                      <div className="flex items-center justify-between border-b border-border pb-4">
                          <h3 className="font-bold text-xl flex items-center gap-2">
                              <MessageCircleIcon className="w-5 h-5" /> 
                              Comments <span className="text-muted-foreground text-sm font-normal">({comments.length})</span>
                          </h3>
                          <div className="flex items-center gap-2 bg-card border border-border p-1 rounded-lg shadow-sm">
                              <button onClick={() => setCommentSortBy('newest')} className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all ${commentSortBy === 'newest' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary/50'}`}><ClockIcon className="w-3.5 h-3.5" /> Newest</button>
                              <button onClick={() => setCommentSortBy('popular')} className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all ${commentSortBy === 'popular' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary/50'}`}><TrendingUpIcon className="w-3.5 h-3.5" /> Popular</button>
                          </div>
                      </div>

                      {comments.map(comment => (
                          <div key={comment.id} className="bg-card p-5 rounded-xl border border-border flex gap-4 shadow-sm hover:shadow-md transition-all">
                              <div className="flex flex-col items-center gap-1 min-w-[32px] pt-1">
                                  <button onClick={() => handleCommentVote(comment.id, 'up')} className={`hover:text-orange-500 transition-colors ${comment.userVote === 'up' ? 'text-orange-500' : 'text-muted-foreground'}`}><ThumbsUpIcon className="w-5 h-5" /></button>
                                  <span className="text-sm font-mono font-bold text-foreground">{(comment.upvotes || 0) - (comment.downvotes || 0)}</span>
                                  <button onClick={() => handleCommentVote(comment.id, 'down')} className={`hover:text-blue-500 transition-colors ${comment.userVote === 'down' ? 'text-blue-500' : 'text-muted-foreground'}`}><ThumbsDownIcon className="w-5 h-5" /></button>
                              </div>

                              <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-3">
                                      {comment.profiles?.profile_picture_url ? <img src={comment.profiles.profile_picture_url} className="w-8 h-8 rounded-full object-cover border border-border" alt="Avatar" /> : <div className="w-8 h-8 bg-secondary rounded-full border border-border" />}
                                      <div>
                                          <div className="text-sm font-bold text-foreground truncate max-w-[200px]">{comment.profiles?.name || 'Unknown'}</div>
                                          <div className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleDateString()}</div>
                                      </div>
                                  </div>
                                  <div className="bg-secondary/20 p-3 rounded-lg border border-border/50">
                                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground">{comment.content}</p>
                                  </div>
                                  {comment.image_url && <div className="mt-3 rounded-lg overflow-hidden max-w-md border border-border shadow-sm"><img src={comment.image_url} alt="Comment image" className="w-full h-auto max-h-64 object-contain bg-black/5" /></div>}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/80 backdrop-blur-md border-t border-border shadow-lg z-10">
                  <div className="max-w-4xl mx-auto">
                      {newCommentImagePreview && <div className="mb-2 relative w-24 h-24 animate-in fade-in slide-in-from-bottom-2"><img src={newCommentImagePreview} alt="Preview" className="w-full h-full object-cover rounded-lg border border-border shadow-sm" /><button onClick={() => { setNewCommentImage(null); setNewCommentImagePreview(''); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"><XCircleIcon className="w-4 h-4" /></button></div>}
                      <div className="flex gap-3 items-end">
                          <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg border border-border">
                              <button className="p-2 rounded-md hover:bg-background hover:shadow-sm transition-all text-muted-foreground hover:text-primary" title="Upload Image" onClick={() => document.getElementById('comment-upload')?.click()}><UploadImageIcon className="w-5 h-5" /><input id="comment-upload" type="file" accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, 'comment')} /></button>
                              <button className="p-2 rounded-md hover:bg-background hover:shadow-sm transition-all text-muted-foreground hover:text-primary" title="Take Picture" onClick={() => startCamera('comment')}><CameraIcon className="w-5 h-5" /></button>
                          </div>
                          <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add to the discussion..." className="flex-1 h-12 text-base" onKeyDown={(e) => e.key === 'Enter' && handleAddComment()} />
                          <Button onClick={handleAddComment} disabled={(!newComment.trim() && !newCommentImage) || isCommenting} className="h-12 px-6 shadow-md"><SendIcon className="w-5 h-5 mr-2" /> Post</Button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {showPostModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={resetPostForm}>
              <Card className="w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                  <CardHeader className="border-b border-border bg-muted/20">
                      <CardTitle>{editingPostId ? 'Edit Post' : 'Create New Post'}</CardTitle>
                      <CardDescription>{editingPostId ? 'Update your content' : `Share with the community in ${activeTab}`}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 overflow-y-auto pt-6">
                      <div className="space-y-1.5"><Label className="font-bold">Title</Label><Input value={postForm.title} onChange={e => setPostForm({...postForm, title: e.target.value})} placeholder="What's on your mind?" className="font-semibold text-lg" /></div>
                      <div className="space-y-1.5"><Label className="font-bold">Content</Label><textarea className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y" value={postForm.content} onChange={e => setPostForm({...postForm, content: e.target.value})} placeholder="Elaborate on your topic..." /></div>
                      
                      <div className="space-y-2 bg-secondary/20 p-4 rounded-xl border border-border/50">
                          <Label className="font-bold mb-2 block">Media Attachments</Label>
                          <div className="flex flex-wrap items-center gap-3">
                              {!editingPostId && (
                                  <>
                                    <Button type="button" variant="outline" className="relative overflow-hidden flex-1 h-10 hover:bg-background hover:border-primary/50 hover:text-primary transition-all">
                                        <UploadImageIcon className="w-4 h-4 mr-2" /> Upload Photo
                                        <input type="file" accept="image/*" onChange={(e) => handleImageSelect(e, 'post')} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    </Button>
                                    <Button variant="outline" onClick={() => startCamera('post')} className="flex-1 h-10 hover:bg-background hover:border-primary/50 hover:text-primary transition-all"><CameraIcon className="w-4 h-4 mr-2" /> Take Photo</Button>
                                  </>
                              )}
                              <Button 
                                variant="outline" 
                                onClick={() => setShowVideoInput(!showVideoInput)} 
                                className={`flex-1 h-10 transition-all ${showVideoInput || postVideoLink ? 'bg-primary/10 border-primary/50 text-primary' : 'hover:bg-background hover:border-primary/50 hover:text-primary'}`}
                              >
                                <PlayIcon className="w-4 h-4 mr-2" /> {postVideoLink ? 'Edit Video Link' : 'Add Video'}
                              </Button>
                          </div>
                          
                          {(showVideoInput || postVideoLink) && (
                              <div className="relative mt-3 animate-in fade-in slide-in-from-top-1">
                                  <PlayIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    value={postVideoLink} 
                                    onChange={e => setPostVideoLink(e.target.value)} 
                                    placeholder="Paste YouTube URL here... (e.g. https://youtu.be/xxx)" 
                                    className="pl-9"
                                    autoFocus={!postVideoLink}
                                  />
                              </div>
                          )}

                          {postImagePreview && (
                              <div className="relative w-full h-48 mt-3 rounded-lg overflow-hidden border border-border bg-black/5 shadow-sm group">
                                  <img src={postImagePreview} alt="Preview" className="w-full h-full object-contain" />
                                  <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs font-mono px-2 py-1 rounded backdrop-blur-sm">
                                      {originalImageSize} &rarr; {postImageSize}
                                  </div>
                                  <button onClick={() => { setPostImage(null); setPostImagePreview(''); setPostImageSize(''); }} className="absolute top-2 right-2 bg-white text-red-500 p-1.5 rounded-full shadow-md hover:scale-110 transition-transform"><XCircleIcon className="w-5 h-5" /></button>
                              </div>
                          )}
                      </div>
                  </CardContent>
                  <CardFooter className="flex justify-end gap-3 border-t border-border bg-muted/20 py-4">
                      <Button variant="ghost" onClick={resetPostForm}>Cancel</Button>
                      <Button onClick={handleSavePost} disabled={isPosting} className="px-8">{isPosting ? 'Saving...' : (editingPostId ? 'Update Post' : 'Post Now')}</Button>
                  </CardFooter>
              </Card>
          </div>
      )}
    </div>
  );
};

export default ForumView;