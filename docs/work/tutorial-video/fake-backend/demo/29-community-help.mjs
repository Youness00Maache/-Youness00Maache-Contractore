// Demo data for chapter 29 (Community and getting help). Everything here is made up. Only built for chapter 29.
//
//  - Community: General 3 posts (one with 3 comments), Suggestion 2 posts with votes, Project Showcase 1 post with a picture, and one post
//    written by Marcus Reed so "My Posts" is not empty. Other members are made-up names in `profiles` (the forum reads authors from there).
//  - 2 unread Community notifications (a like and a comment on Marcus's post), so the Community badge shows a number.
//  - The Help center (/tutorials) and the guides come from the app itself.
// A post's comment count is an embedded count in the app's query (forum_comments(count)): answered by embedCounts below.

const MINE = new Set(['29']);
const MARCUS = '00000000-0000-4000-8000-000000000001';
const BASE = (process.env.TUTORIAL_BACKEND || 'http://127.0.0.1:54329').replace(/\/$/, '');
const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));

export default ({ tables, iso, id, chapter }) => {
  if (!MINE.has(chapter)) return;
  const members = [
    { id: '00000000-0000-4000-8000-0000000000c1', name: 'Dale Whitaker', profile_picture_url: null },
    { id: '00000000-0000-4000-8000-0000000000c2', name: 'Priya Nand', profile_picture_url: null },
    { id: '00000000-0000-4000-8000-0000000000c3', name: 'Joe Santos', profile_picture_url: null },
    { id: '00000000-0000-4000-8000-0000000000c4', name: 'Rita Hall', profile_picture_url: null },
  ];
  const [dale, priya, joe, rita] = members;
  const profiles = table(tables, 'profiles');
  for (const m of members) profiles.push({ id: m.id, name: m.name, profile_picture_url: null, created_at: iso(-200) });

  const posts = table(tables, 'forum_posts');
  const post = (user, category, title, content, ups, downs, off, extra = {}) => ({ id: id(), user_id: user.id || user, category, title, content, image_url: null, youtube_url: null, upvotes: ups, downvotes: downs, created_at: iso(off, 9), ...extra });
  const how = post(dale, 'General', 'How do you price small repair jobs?', 'I keep losing money on the 2-hour jobs because of driving and setup. Do you set a minimum charge, or bill the travel time? Curious what works for you.', 9, 0, -3);
  posts.push(
    how,
    post(priya, 'General', 'Tip: photograph the old part before you start', 'Takes ten seconds, and it settles every "it was already broken" talk later. I add the photo to the job right away.', 14, 1, -5),
    post(rita, 'General', 'Request link on the van: worth it?', 'Thinking of putting a QR code on both sides of the van. Has anyone tried it? Did you get real calls?', 4, 0, -8),
    post(MARCUS, 'General', 'Do you take deposits on small jobs?', 'I ask for 50% on anything over $1,000 and nothing on repairs under that. What do you do?', 3, 0, -2),
    post(joe, 'Suggestion', 'Let me attach a photo to a time sheet', 'My crew takes a picture of the finished work at clock-out. It would be great to see it on the time sheet.', 21, 0, -6),
    post(dale, 'Suggestion', 'Print the estimate in Spanish', 'Half of my clients read Spanish. An option to print the document in Spanish would save me a lot of time.', 12, 1, -9),
    post(rita, 'Project Showcase', 'Basement finish: three weeks, start to finish', 'New walls, flooring and lighting. The owners wanted a bright room for the kids. Happy with how the stairs turned out.', 17, 0, -4, { image_url: `${BASE}/storage/v1/object/public/forum/basement-finish.jpg` }),
  );
  const comments = table(tables, 'forum_comments');
  const comment = (postRow, user, content, off) => ({ id: id(), post_id: postRow.id, user_id: user.id, content, image_url: null, upvotes: 1, downvotes: 0, created_at: iso(off, 14) });
  comments.push(
    comment(how, priya, 'I charge a one-hour minimum and say so on the estimate. Nobody has argued with it yet.', -3),
    comment(how, joe, 'Same here. I also add a small trip fee when it is more than 20 minutes away.', -2),
    comment(how, rita, 'A flat price for "small repairs" under two hours works for me. Easier to explain than hourly.', -2),
  );

  // two unread replies to Marcus's post: the badge on Community
  const mine = posts.find((p) => p.user_id === MARCUS);
  const notes = table(tables, 'notifications');
  notes.push(
    { id: id(), user_id: MARCUS, type: 'comment', post_id: mine.id, source_user_id: priya.id, created_at: iso(0, 7), is_read: false },
    { id: id(), user_id: MARCUS, type: 'like', post_id: mine.id, source_user_id: joe.id, created_at: iso(-1, 20), is_read: false },
  );
};

export const embedCounts = {
  'forum_posts.forum_comments': (row, tables) => (tables.get('forum_comments') || []).filter((c) => c.post_id === row.id).length,
};
