'use strict';

const privileges = require('../privileges');

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

	/**
	 * Resolve post IDs to topic URLs. Only includes posts that exist; uses
	 * Posts.generatePostPaths for path generation. Does not perform permission
	 * checks (handled separately for rendering).
	 * @param {number[]} pids - Post IDs to resolve
	 * @param {number} uid - User ID for path generation (post order can depend on user settings)
	 * @returns {Promise<Object.<number, string>>} Map of pid -> path (e.g. '/topic/1/slug/2')
	 */
	Posts.resolvePostReferencePaths = async function (pids, uid) {
		if (!Array.isArray(pids) || pids.length === 0) {
			return {};
		}
		const unique = [...new Set(pids)];
		const exists = await Posts.exists(unique);
		const existingPids = unique.filter((pid, i) => exists[i]);
		if (existingPids.length === 0) {
			return {};
		}
		const paths = await Posts.generatePostPaths(existingPids, uid);
		const result = {};
		existingPids.forEach((pid, i) => {
			if (paths[i]) {
				result[pid] = paths[i];
			}
		});
		return result;
	};

	/**
	 * Return which of the given post IDs the user is allowed to view (topics:read).
	 * Used before link rendering so references to posts the viewer cannot see
	 * stay as plain @number text.
	 * @param {number[]} pids - Post IDs to check
	 * @param {number} uid - Viewer user ID
	 * @returns {Promise<number[]>} Pids the user may read (subset of input)
	 */
	Posts.getVisiblePostReferencePids = async function (pids, uid) {
		if (!Array.isArray(pids) || pids.length === 0) {
			return [];
		}
		const filtered = await privileges.posts.filter('topics:read', pids, uid);
		return filtered || [];
	};

	/**
	 * Replace valid @post-number references in escaped content with clickable links.
	 * Only runs when uid is set (viewer context). Uses getVisiblePostReferencePids
	 * and resolvePostReferencePaths; replaces from end to start so indices stay valid.
	 * @param {string} content - Escaped post content (after translator.escape)
	 * @param {number} uid - Viewer user ID (undefined = no links, leave as plain text)
	 * @returns {Promise<string>}
	 */
	Posts.replacePostReferenceLinks = async function (content, uid) {
		if (content == null || typeof content !== 'string' || uid == null || uid === '') {
			return content;
		}
		const refs = parsePostReferences(content);
		if (refs.length === 0) {
			return content;
		}
		const pids = [...new Set(refs.map(r => r.pid))];
		const visiblePids = await Posts.getVisiblePostReferencePids(pids, uid);
		if (visiblePids.length === 0) {
			return content;
		}
		const pathMap = await Posts.resolvePostReferencePaths(visiblePids, uid);
		// Replace from end to start so earlier indices are not invalidated
		const sortedRefs = refs.slice().sort((a, b) => b.start - a.start);
		let out = content;
		for (const ref of sortedRefs) {
			const path = pathMap[ref.pid];
			if (path) {
				const href = path.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
				const link = `<a href="${href}">@${ref.pid}</a>`;
				out = out.slice(0, ref.start) + link + out.slice(ref.end);
			}
		}
		return out;
	};
};
