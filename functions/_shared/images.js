export function resolvePostImageUrl(origin, postId, imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  if (imageUrl.startsWith('data:')) return `${origin}/api/posts/${postId}/image`;
  return null;
}

export function serializePostImage(post, origin) {
  if (!post || !post.id) return post;
  const resolved = resolvePostImageUrl(origin, post.id, post.image_url);
  if (!resolved) return post;
  return Object.assign({}, post, { image_url: resolved });
}
