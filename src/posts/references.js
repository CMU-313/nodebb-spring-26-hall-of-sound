'use strict';

/**
 * Post/topic reference links (@post-number) for answers and comments.
 *
 * Integration points:
 * - Post content parse/render: filter:parse.post in src/posts/parse.js.
 *    Content is sanitized by core, then escaped; @post reference replacement
 *    runs after escape so links are not escaped. Replacement is done in this
 *    module and invoked from parse.js.
 * - Viewer uid for permissions: passed via postData.parsedForUid. Set in
 *    src/posts/summary.js (parsePosts) so that getPostSummaryByPids can
 *    render links only for references the viewer is allowed to see.
 * - Post/topic URLs: Posts.generatePostPaths (src/posts/topics.js) produces
 *    paths like /topic/<slug>/<index>. Use for href of resolved references.
 * - Permission checks: privileges.posts.filter('topics:read', pids, uid) in
 *    src/privileges/posts.js to determine which referenced posts the viewer
 *    may see. Only those are rendered as links; others stay plain @number.
 *
 * Syntax: @<digits> (e.g. @23). We match only digits after @ so that
 * @username mentions (letters) are not treated as post references and
 * existing mention behavior is unchanged.
 */

const postReferenceRegex = /@(\d+)/g;

/**
 * Find all @post-number references in content. Matches only @ followed by
 * digits (e.g. @23, @1); does not match @username. Returns matches in order
 * (left to right); each match has pid, start, end for safe replacement.
 * @param {string} content - Raw or escaped post content
 * @returns {{ pid: number, start: number, end: number }[]}
 */
function parsePostReferences(content) {
	if (!content || typeof content !== 'string') {
		return [];
	}
	const refs = [];
	let m;
	postReferenceRegex.lastIndex = 0;
	while ((m = postReferenceRegex.exec(content)) !== null) {
		refs.push({
			pid: parseInt(m[1], 10),
			start: m.index,
			end: m.index + m[0].length,
		});
	}
	return refs;
}

module.exports = function (Posts) {
	Posts.parsePostReferences = parsePostReferences;
};
