
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { Input } from './ui/Input.tsx';
import { Label } from './ui/Label.tsx';
import { BackArrowIcon, MessageSquareIcon, ThumbsUpIcon, ThumbsDownIcon, MessageCircleIcon, SendIcon, UploadImageIcon, XCircleIcon, CameraIcon, ClockIcon, TrendingUpIcon } from './Icons.tsx';
import { compressImage } from '../utils/imageCompression.ts';

interface ForumViewProps {
  onBack: () => void;
  supabase: any;
  session: any;
  onUploadImage: (file: File) => Promise<string>;
  initialPostId?: string;
  onNavigate: (postId: string | null) => void;
}

interface Post {
  id: string;
  title: string;
  content: string;
  category: string;
  upvotes: number;
  downvotes: number;
  image_url?: string;
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

type Category = 'General' | 'Suggestion' | 'Project Showcase';
type SortOption = 'newest' | 'popular';

const ForumView: React.FC<ForumViewProps> = ({ onBack, supabase, session, onUploadImage, initialPostId, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<Category>('General');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [commentSortBy, setCommentSortBy] = useState<SortOption>('newest');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', content: '' });
  const [newPostImage, setNewPostImage] = useState<File | null>(null);
  const [newPostImagePreview, setNewPostImagePreview] = useState<string>('');
  const [newPostImageSize, setNewPostImageSize] = useState<string>(''); 
  const [originalImageSize, setOriginalImageSize] = useState<string>(''); 
  const [isPosting, setIsPosting] = useState(false);
  
  // Comment/Detail View State
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newCommentImage, setNewCommentImage] = useState<File | null>(null);
  const [newCommentImagePreview, setNewCommentImagePreview] = useState<string>('');
  const [isCommenting, setIsCommenting] = useState(false);

  // Camera State
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraMode, setCameraMode] = useState<'post' | 'comment' | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const categoryDescriptions: Record<Category, string> = {
      'General': 'General discussion about the trade. Ask questions, share news, or chat with peers.',
      'Suggestion': 'This is a suggestions forum. Users suggest features to add to the app that they think will be really cool.',
      'Project Showcase': 'Share photos of your latest work and get feedback from the community.'
  };

  useEffect(() => {
    if (session) fetchPosts();
  }, [session, activeTab, sortBy]);

  // Handle Deep Linking / Persistence
  useEffect(() => {
      if (initialPostId) {
          // If we already have it selected, do nothing
          if (selectedPost?.id === initialPostId) return;
          
          // Check if it's in the current posts list
          const existing = posts.find(p => p.id === initialPostId);
          if (existing) {
              setSelectedPost(existing);
          } else {
              // If not in the list (e.g. direct refresh), fetch it individually
              fetchPostDetails(initialPostId);
          }
      } else {
          setSelectedPost(null);
      }
  }, [initialPostId, posts]);

  // Clean up object URLs
  useEffect(() => {
      return () => {
          if (newPostImagePreview) URL.revokeObjectURL(newPostImagePreview);
          if (newCommentImagePreview) URL.revokeObjectURL(newCommentImagePreview);
      };
  }, [newPostImagePreview, newCommentImagePreview]);

  // Fetch Comments when a post is selected
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
          // Fetch vote
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
      
      let query = supabase
          .from('forum_posts')
          .select(`
            *,
            profiles:user_id (name, profile_picture_url),
            forum_comments (count)
          `)
          .eq('category', activeTab);

      // Apply sort to query
      if (sortBy === 'newest') {
          query = query.order('created_at', { ascending: false });
      } else {
          query = query.order('upvotes', { ascending: false });
      }

      const { data: postsData, error: postsError } = await query;

      if (postsError) {
          console.error("Error fetching posts:", JSON.stringify(postsError, null, 2));
          setLoading(false);
          return;
      }

      const { data: votesData } = await supabase
        .from('forum_votes')
        .select('post_id, vote_type')
        .eq('user_id', session.user.id);

      const votesMap = new Map();
      if (votesData) {
          votesData.forEach((v: any) => votesMap.set(v.post_id, v.vote_type));
      }

      const formattedPosts = (postsData || []).map((p: any) => ({
          ...p,
          userVote: votesMap.get(p.id) || null,
          score: (p.upvotes || 0) - (p.downvotes || 0),
          comment_count: p.forum_comments ? p.forum_comments[0]?.count : 0
      }));

      if (sortBy === 'popular') {
          formattedPosts.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
      } else {
          formattedPosts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }

      setPosts(formattedPosts);
      setLoading(false);
  };

  const fetchComments = async (postId: string) => {
      const { data: commentsData, error } = await supabase
        .from('forum_comments')
        .select('*, profiles:user_id(name, profile_picture_url)')
        .eq('post_id', postId);

      if (error) {
          console.error("Error fetching comments:", error);
          return;
      }

      const { data: votesData } = await supabase
        .from('forum_comment_votes')
        .select('comment_id, vote_type')
        .eq('user_id', session.user.id)
        .in('comment_id', commentsData.map((c: any) => c.id));

      const votesMap = new Map();
      if (votesData) {
          votesData.forEach((v: any) => votesMap.set(v.comment_id, v.vote_type));
      }

      let formattedComments = commentsData.map((c: any) => ({
          ...c,
          upvotes: c.upvotes || 0,
          downvotes: c.downvotes || 0,
          userVote: votesMap.get(c.id) || null,
          score: (c.upvotes || 0) - (c.downvotes || 0)
      }));

      if (commentSortBy === 'newest') {
          formattedComments.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else {
          formattedComments.sort((a: any, b: any) => b.score - a.score);
      }

      setComments(formattedComments);
  };

  const handleVote = async (postId: string, type: 'up' | 'down') => {
      const postIndex = posts.findIndex(p => p.id === postId);
      if (postIndex === -1 && selectedPost?.id !== postId) return;
      
      // Find post (either in list or selected)
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
          
          if (type === 'up') newUpvotes++;
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

      if (commentSortBy === 'popular') {
          newComments.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

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
              
              if (type === 'post') {
                  setNewPostImage(compressedFile);
                  setNewPostImagePreview(preview);
                  setNewPostImageSize(`${(compressedFile.size / 1024).toFixed(1)} KB`);
              } else {
                  setNewCommentImage(compressedFile);
                  setNewCommentImagePreview(preview);
              }
          } catch (err) {
              alert("Could not process image.");
          }
      }
  };

  const startCamera = async (mode: 'post' | 'comment') => {
      setCameraMode(mode);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert("Camera API is not supported in this browser.");
          return;
      }

      try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === 'videoinput');
          
          if (videoDevices.length === 0) {
              alert("No camera found on this device.");
              return;
          }

          let stream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          } catch (e) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
          
          streamRef.current = stream;
          setShowCameraModal(true);
      } catch (err: any) {
          alert("Error accessing camera: " + (err.message || "Unknown error"));
      }
  };

  const stopCamera = () => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      setShowCameraModal(false);
      setCameraMode(null);
  };

  const videoCallbackRef = useCallback((node: HTMLVideoElement) => {
      videoRef.current = node;
      if (node && streamRef.current) {
          node.srcObject = streamRef.current;
          node.play().catch(e => console.log("Play error:", e));
      }
  }, [showCameraModal]);

  const capturePhoto = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              
              canvas.toBlob(async (blob) => {
                  if (blob) {
                      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
                      try {
                          const compressedFile = await compressImage(file);
                          const preview = URL.createObjectURL(compressedFile);
                          
                          if (cameraMode === 'post') {
                              setNewPostImage(compressedFile);
                              setNewPostImagePreview(preview);
                              setOriginalImageSize(`${(file.size / 1024).toFixed(1)} KB`);
                              setNewPostImageSize(`${(compressedFile.size / 1024).toFixed(1)} KB`);
                          } else if (cameraMode === 'comment') {
                              setNewCommentImage(compressedFile);
                              setNewCommentImagePreview(preview);
                          }
                          stopCamera();
                      } catch (err) {
                          alert("Could not process photo.");
                      }
                  }
              }, 'image/jpeg', 0.9);
          }
      }
  };

  const handleCreatePost = async () => {
      if (!newPost.title || !newPost.content) return;
      setIsPosting(true);
      let imageUrl = null;

      try {
          if (newPostImage) {
              try {
                imageUrl = await onUploadImage(newPostImage);
              } catch (uploadError: any) {
                  if (uploadError.message && (uploadError.message.includes('Bucket not found') || uploadError.message.includes('row not found'))) {
                      throw new Error("Forum image bucket not found. Please run the Database Setup script.");
                  }
                  throw new Error(`Image upload failed: ${uploadError.message}`);
              }
          }

          const { error } = await supabase.from('forum_posts').insert({
              user_id: session.user.id,
              title: newPost.title,
              content: newPost.content,
              category: activeTab,
              image_url: imageUrl
          });

          if (error) throw error;

          setShowNewPostModal(false);
          setNewPost({ title: '', content: '' });
          setNewPostImage(null);
          setNewPostImagePreview('');
          await fetchPosts();

      } catch (error: any) {
          alert(`Failed to post: ${error.message || JSON.stringify(error)}`);
      } finally {
          setIsPosting(false);
      }
  };

  const handleAddComment = async () => {
      if (!newComment.trim() && !newCommentImage) return;
      if (!selectedPost) return;
      setIsCommenting(true);
      let imageUrl = null;

      try {
          if (newCommentImage) {
              imageUrl = await onUploadImage(newCommentImage);
          }

          const { data, error } = await supabase
            .from('forum_comments')
            .insert({
                post_id: selectedPost.id,
                user_id: session.user.id,
                content: newComment,
                image_url: imageUrl
            })
            .select('*, profiles:user_id(name, profile_picture_url)')
            .single();

          if (!error && data) {
              const newCommentObj = { ...data, upvotes: 0, downvotes: 0, score: 0, userVote: null };
              setComments([...comments, newCommentObj]);
              setNewComment('');
              setNewCommentImage(null);
              setNewCommentImagePreview('');
              setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p));
          } else if (error) {
              alert(`Failed to comment: ${error.message}`);
          }
      } catch (e: any) {
          alert('Error posting comment: ' + e.message);
      } finally {
          setIsCommenting(false);
      }
  };

  const handlePostClick = (postId: string) => {
      onNavigate(postId);
  };

  const handleClosePost = () => {
      onNavigate(null);
  };

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
        <div className="flex items-center">
             <Button variant="ghost" size="sm" onClick={selectedPost ? handleClosePost : onBack} className="w-12 h-12 p-0 flex items-center justify-center mr-4" aria-label="Back">
                <BackArrowIcon className="h-9 w-9" />
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <MessageSquareIcon className="w-8 h-8 text-primary" />
                Community Forum
            </h1>
         </div>
         {!selectedPost && (
             <Button onClick={() => setShowNewPostModal(true)}>+ New Post</Button>
         )}
      </header>

      {/* Camera Modal */}
      {showCameraModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={stopCamera}>
                <Card className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
                    <CardHeader>
                        <CardTitle>Take Photo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-auto max-h-[60vh] rounded-md bg-black" />
                        <canvas ref={canvasRef} className="hidden" />
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                        <Button variant="outline" onClick={stopCamera}>Cancel</Button>
                        <Button onClick={capturePhoto}>
                            <CameraIcon className="w-4 h-4 mr-2" /> Capture
                        </Button>
                    </CardFooter>
                </Card>
            </div>
      )}

      {!selectedPost ? (
          <div className="max-w-4xl mx-auto w-full space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex gap-2 overflow-x-auto pb-2">
                      {(['General', 'Suggestion', 'Project Showcase'] as Category[]).map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${activeTab === tab ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                          >
                              {tab}
                          </button>
                      ))}
                  </div>
                  
                  <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg self-start sm:self-auto">
                      <button 
                        onClick={() => setSortBy('newest')} 
                        className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all ${sortBy === 'newest' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
                      >
                          <ClockIcon className="w-3.5 h-3.5" /> Newest
                      </button>
                      <button 
                        onClick={() => setSortBy('popular')} 
                        className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all ${sortBy === 'popular' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
                      >
                          <TrendingUpIcon className="w-3.5 h-3.5" /> Popular
                      </button>
                  </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 px-4 py-3 rounded-lg border border-blue-200 dark:border-blue-800 flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
                  <MessageCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm font-medium">{categoryDescriptions[activeTab]}</p>
              </div>

              <div className="space-y-4">
                  {loading ? (
                      <div className="text-center py-10 text-muted-foreground">Loading community...</div>
                  ) : posts.length === 0 ? (
                      <div className="text-center py-10 bg-muted/30 rounded-lg">
                          <p className="text-muted-foreground">No posts in this category yet. Be the first!</p>
                      </div>
                  ) : (
                      posts.map(post => (
                          <Card key={post.id} className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden animate-fade-in-down" onClick={() => handlePostClick(post.id)}>
                              <div className="flex">
                                  <div className="flex flex-col items-center p-3 bg-muted/30 border-r border-border gap-1 min-w-[50px]" onClick={e => e.stopPropagation()}>
                                      <button onClick={() => handleVote(post.id, 'up')} className={`p-1 rounded hover:bg-background ${post.userVote === 'up' ? 'text-orange-500' : 'text-muted-foreground'}`}>
                                          <ThumbsUpIcon className="w-5 h-5" />
                                      </button>
                                      <span className="text-sm font-bold font-mono">{(post.upvotes - post.downvotes)}</span>
                                      <button onClick={() => handleVote(post.id, 'down')} className={`p-1 rounded hover:bg-background ${post.userVote === 'down' ? 'text-blue-500' : 'text-muted-foreground'}`}>
                                          <ThumbsDownIcon className="w-5 h-5" />
                                      </button>
                                  </div>
                                  <div className="flex-1 p-4">
                                      <h3 className="text-lg font-semibold mb-1">{post.title}</h3>
                                      <p className="text-sm text-muted-foreground line-clamp-3 mb-3 whitespace-pre-wrap">{post.content}</p>
                                      {post.image_url && (
                                          <div className="mb-3 rounded-md overflow-hidden w-full bg-muted">
                                              <img src={post.image_url} alt="Post attachment" className="w-full h-auto max-h-[600px] object-contain bg-black/5" />
                                          </div>
                                      )}
                                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                                          <div className="flex items-center gap-2">
                                              {post.profiles?.profile_picture_url ? (
                                                  <img src={post.profiles.profile_picture_url} className="w-5 h-5 rounded-full object-cover" alt="avatar" />
                                              ) : (
                                                  <div className="w-5 h-5 bg-primary/20 rounded-full" />
                                              )}
                                              <span>{post.profiles?.name || 'Unknown'}</span>
                                              <span>•</span>
                                              <span>{new Date(post.created_at).toLocaleDateString()}</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                              <MessageCircleIcon className="w-4 h-4" />
                                              <span>{post.comment_count || 0} Comments</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </Card>
                      ))
                  )}
              </div>
          </div>
      ) : (
          <div className="max-w-4xl mx-auto w-full h-full flex flex-col overflow-hidden animate-in fade-in">
              <div className="flex-1 overflow-y-auto space-y-6 pb-4">
                  <Card>
                      <div className="flex">
                          <div className="flex flex-col items-center p-4 bg-muted/30 border-r border-border gap-2 min-w-[60px]">
                              <button onClick={() => handleVote(selectedPost.id, 'up')} className={`p-1 rounded hover:bg-background ${selectedPost.userVote === 'up' ? 'text-orange-500' : 'text-muted-foreground'}`}>
                                  <ThumbsUpIcon className="w-6 h-6" />
                              </button>
                              <div className="text-lg font-bold">{(selectedPost.upvotes - selectedPost.downvotes)}</div>
                              <button onClick={() => handleVote(selectedPost.id, 'down')} className={`p-1 rounded hover:bg-background ${selectedPost.userVote === 'down' ? 'text-blue-500' : 'text-muted-foreground'}`}>
                                  <ThumbsDownIcon className="w-6 h-6" />
                              </button>
                          </div>
                          <div className="flex-1 p-6">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">{selectedPost.category}</span>
                                  <span>Posted by {selectedPost.profiles?.name || 'User'}</span>
                                  <span>• {new Date(selectedPost.created_at).toLocaleDateString()}</span>
                              </div>
                              <h2 className="text-2xl font-bold mb-4">{selectedPost.title}</h2>
                              <p className="text-foreground whitespace-pre-wrap leading-relaxed mb-6">{selectedPost.content}</p>
                              {selectedPost.image_url && (
                                  <div className="rounded-lg overflow-hidden border border-border mb-4">
                                      <img src={selectedPost.image_url} alt="Post content" className="w-full h-auto" />
                                  </div>
                              )}
                          </div>
                      </div>
                  </Card>

                  <div className="space-y-4 pl-4 border-l-2 border-muted ml-4">
                      <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-lg">Comments ({comments.length})</h3>
                          <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg">
                              <button 
                                onClick={() => setCommentSortBy('newest')} 
                                className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-all ${commentSortBy === 'newest' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
                              >
                                  <ClockIcon className="w-3 h-3" /> Newest
                              </button>
                              <button 
                                onClick={() => setCommentSortBy('popular')} 
                                className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-all ${commentSortBy === 'popular' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
                              >
                                  <TrendingUpIcon className="w-3 h-3" /> Popular
                              </button>
                          </div>
                      </div>

                      {comments.map(comment => (
                          <div key={comment.id} className="bg-card p-4 rounded-lg border border-border flex gap-3">
                              <div className="flex flex-col items-center gap-1 min-w-[24px] pt-1">
                                  <button onClick={() => handleCommentVote(comment.id, 'up')} className={`hover:text-orange-500 ${comment.userVote === 'up' ? 'text-orange-500' : 'text-muted-foreground'}`}>
                                      <ThumbsUpIcon className="w-4 h-4" />
                                  </button>
                                  <span className="text-xs font-mono font-bold">{(comment.upvotes || 0) - (comment.downvotes || 0)}</span>
                                  <button onClick={() => handleCommentVote(comment.id, 'down')} className={`hover:text-blue-500 ${comment.userVote === 'down' ? 'text-blue-500' : 'text-muted-foreground'}`}>
                                      <ThumbsDownIcon className="w-4 h-4" />
                                  </button>
                              </div>

                              <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                      {comment.profiles?.profile_picture_url ? (
                                          <img src={comment.profiles.profile_picture_url} className="w-6 h-6 rounded-full object-cover" alt="Avatar" />
                                      ) : (
                                          <div className="w-6 h-6 bg-secondary rounded-full" />
                                      )}
                                      <span className="text-sm font-medium">{comment.profiles?.name || 'Unknown'}</span>
                                      <span className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleDateString()}</span>
                                  </div>
                                  <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                                  {comment.image_url && (
                                      <div className="mt-3 rounded-md overflow-hidden max-w-md">
                                          <img src={comment.image_url} alt="Comment image" className="w-full h-auto max-h-64 object-contain bg-muted" />
                                      </div>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              <div className="bg-background pt-4 border-t border-border">
                  {newCommentImagePreview && (
                      <div className="mb-2 relative w-24 h-24">
                          <img src={newCommentImagePreview} alt="Preview" className="w-full h-full object-cover rounded border border-border" />
                          <button 
                            onClick={() => { setNewCommentImage(null); setNewCommentImagePreview(''); }} 
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"
                          >
                              <XCircleIcon className="w-4 h-4" />
                          </button>
                      </div>
                  )}
                  <div className="flex gap-2 items-end">
                      <div className="flex gap-2">
                          <button 
                            className="p-2 rounded-md hover:bg-secondary border border-transparent hover:border-border text-muted-foreground" 
                            title="Upload Image"
                            onClick={() => document.getElementById('comment-upload')?.click()}
                          >
                              <UploadImageIcon className="w-5 h-5" />
                              <input 
                                id="comment-upload" 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => handleImageSelect(e, 'comment')} 
                              />
                          </button>
                          <button 
                            className="p-2 rounded-md hover:bg-secondary border border-transparent hover:border-border text-muted-foreground" 
                            title="Take Picture"
                            onClick={() => startCamera('comment')}
                          >
                              <CameraIcon className="w-5 h-5" />
                          </button>
                      </div>
                      <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add to the discussion..." className="flex-1" onKeyDown={(e) => e.key === 'Enter' && handleAddComment()} />
                      <Button onClick={handleAddComment} disabled={(!newComment.trim() && !newCommentImage) || isCommenting}>
                          <SendIcon className="w-4 h-4 mr-2" /> Post
                      </Button>
                  </div>
              </div>
          </div>
      )}

      {showNewPostModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNewPostModal(false)}>
              <Card className="w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                  <CardHeader><CardTitle>Create New Post</CardTitle><CardDescription>Share with the community in {activeTab}</CardDescription></CardHeader>
                  <CardContent className="space-y-4 overflow-y-auto">
                      <div className="space-y-1.5"><Label>Title</Label><Input value={newPost.title} onChange={e => setNewPost({...newPost, title: e.target.value})} placeholder="What's on your mind?" /></div>
                      <div className="space-y-1.5"><Label>Content</Label><textarea className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={newPost.content} onChange={e => setNewPost({...newPost, content: e.target.value})} placeholder="Elaborate on your topic..." /></div>
                      <div className="space-y-1.5">
                          <Label>Image (Optional)</Label>
                          <div className="flex flex-wrap items-center gap-3">
                              <Button type="button" variant="outline" className="relative overflow-hidden flex-1">
                                  <UploadImageIcon className="w-4 h-4 mr-2" /> Upload Photo
                                  <input type="file" accept="image/*" onChange={(e) => handleImageSelect(e, 'post')} className="absolute inset-0 opacity-0 cursor-pointer" />
                              </Button>
                              <Button variant="outline" onClick={() => startCamera('post')} className="flex-1"><CameraIcon className="w-4 h-4 mr-2" /> Take Picture</Button>
                          </div>
                          {newPostImagePreview && (
                              <div className="relative w-full h-32 mt-2 rounded-md overflow-hidden border border-border bg-muted">
                                  <img src={newPostImagePreview} alt="Preview" className="w-full h-full object-contain" />
                                  <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 rounded">
                                      {originalImageSize} &rarr; {newPostImageSize}
                                  </div>
                                  <button onClick={() => { setNewPostImage(null); setNewPostImagePreview(''); setNewPostImageSize(''); }} className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-red-500 transition-colors"><XCircleIcon className="w-5 h-5" /></button>
                              </div>
                          )}
                      </div>
                  </CardContent>
                  <CardFooter className="flex justify-end gap-2 border-t pt-4">
                      <Button variant="outline" onClick={() => setShowNewPostModal(false)}>Cancel</Button>
                      <Button onClick={handleCreatePost} disabled={isPosting}>{isPosting ? 'Posting...' : 'Post'}</Button>
                  </CardFooter>
              </Card>
          </div>
      )}
    </div>
  );
};

export default ForumView;
