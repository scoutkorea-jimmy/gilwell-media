const DEFAULT_POST_PLACEHOLDER_PATH = '/img/logo.png';

export function resolvePostImageUrl(origin, postId, imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  if (imageUrl.startsWith('data:')) return `${origin}/api/posts/${postId}/image`;
  return null;
}

export function serializePostImage(post, origin) {
  if (!post || !post.id) return post;
  const resolved = resolvePostImageUrl(origin, post.id, post.image_url);
  const hasRealAsset = !!resolved;
  if (!resolved) {
    return Object.assign({}, post, {
      image_url: `${origin}${DEFAULT_POST_PLACEHOLDER_PATH}`,
      image_is_placeholder: true,
      image_has_real_asset: false,
    });
  }
  return Object.assign({}, post, {
    image_url: resolved,
    image_is_placeholder: false,
    image_has_real_asset: hasRealAsset,
  });
}
