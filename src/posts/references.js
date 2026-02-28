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

// --- Parsing (pure, no I/O) ---

/**
 * Find all @post-number references in content. Matches only @ followed by
 * digits (e.g. @23, @1); does not match @username. Returns matches in order
 * (left to right); each match has pid, start, end for safe replacement.
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

// --- Path safety and link building (pure, no I/O) ---

function isSafePath(path) {
	return typeof path === 'string' && path.startsWith('/') &&
		path.indexOf('<') === -1 && path.indexOf('"') === -1;
}

function escapeHrefForAttribute(path) {
	return path.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function buildReferenceLink(pid, path) {
	return `<a href="${escapeHrefForAttribute(path)}">@${pid}</a>`;
}

/**
 * Apply replacements from end to start so indices remain valid. Only replaces
 * refs whose pid is in pathMap with a safe path; others stay as plain text.
 */
function applyReferenceReplacements(content, refs, pathMap) {
	const sortedRefs = refs.slice().sort((a, b) => b.start - a.start);
	let out = content;
	for (const ref of sortedRefs) {
		const path = pathMap[ref.pid];
		if (path && isSafePath(path)) {
			const link = buildReferenceLink(ref.pid, path);
			out = out.slice(0, ref.start) + link + out.slice(ref.end);
		}
	}
	return out;
}

// --- Resolution and permissions (async, use Posts and privileges) ---

module.exports = function (Posts) {
	Posts.parsePostReferences = parsePostReferences;

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

	Posts.getVisiblePostReferencePids = async function (pids, uid) {
		if (!Array.isArray(pids) || pids.length === 0) {
			return [];
		}
		const filtered = await privileges.posts.filter('topics:read', pids, uid);
		return filtered || [];
	};

	/**
	 * Replace valid @post-number references in escaped content with clickable links.
	 * Pipeline: parse refs -> filter by visibility -> resolve paths -> apply replacements.
	 * Invalid, nonexistent, or unauthorized refs are left as plain @number text.
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
		return applyReferenceReplacements(content, refs, pathMap);
	};
};
