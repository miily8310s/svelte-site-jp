import * as fs from 'fs';
import * as path from 'path';
import marked from 'marked';
import send from '@polka/send';
import { extract_frontmatter, extract_metadata, link_renderer } from '@sveltejs/site-kit/utils/markdown';
import { highlight } from '../../../utils/highlight';
import { getCookie } from '../../../modules/cookie.js'

const cache = new Map();

function find_tutorial(slug) {
	const sections = fs.readdirSync(`content/tutorial`);

	for (const section of sections) {
		const chapters = fs.readdirSync(`content/tutorial/${section}`).filter(dir => /^\d+/.test(dir));
		for (const chapter of chapters) {
			if (slug === chapter.replace(/^\d+-/, '')) {
				return { section, chapter };
			}
		}
	}
}

function get_tutorial(slug, locale) {
	const found = find_tutorial(slug);
	if (!found) return found;

	const dir = `content/tutorial/${found.section}/${found.chapter}`;

	// TODO 処理フローはあとで見直す
	let markdown;
	if (locale && locale !== 'en') {
		try {
			markdown = fs.readFileSync(`${dir}/text.${locale}.md`, 'utf-8');
		} catch (err) {
			markdown = fs.readFileSync(`${dir}/text.md`, 'utf-8');
		}
	} else {
		markdown = fs.readFileSync(`${dir}/text.md`, 'utf-8');
	}
	const app_a = fs.readdirSync(`${dir}/app-a`);
	const app_b = fs.existsSync(`${dir}/app-b`) && fs.readdirSync(`${dir}/app-b`);

	const { content } = extract_frontmatter(markdown);

	const renderer = new marked.Renderer();

	renderer.link = link_renderer;

	renderer.code = (source, lang) => {
		source = source.replace(/^ +/gm, match =>
			match.split('    ').join('\t')
		);

		const lines = source.split('\n');

		const meta = extract_metadata(lines[0], lang);

		let prefix = '';
		let className = 'code-block';

		if (meta) {
			source = lines.slice(1).join('\n');
			const filename = meta.filename || (lang === 'html' && 'App.svelte');
			if (filename) {
				prefix = `<span class='filename'>${prefix} ${filename}</span>`;
				className += ' named';
			}
		}

		return `<div class='${className}'>${prefix}${highlight(source, lang)}</div>`;
	};

	let html = marked(content, { renderer });
	if (found.chapter.startsWith('01')) {
		const meta = JSON.parse(fs.readFileSync(`content/tutorial/${found.section}/meta.json`));
		html = `<h2>${meta.title}</h2>\n${html}`;
	}

	function get_file(stage, file) {
		const ext = path.extname(file);
		const name = file.slice(0, -ext.length);
		const type = ext.slice(1);

		return {
			name,
			type,
			source: fs.readFileSync(`${dir}/${stage}/${file}`, 'utf-8')
		};
	}

	return {
		html,
		app_a: app_a.map(file => get_file('app-a', file)),
		app_b: app_b && app_b.map(file => get_file('app-b', file))
	};
}

export function get(req, res) {
	const { slug } = req.params;

	const locale = getCookie('locale', req.headers.cookie);
	const slugWithLocale = locale ? slug + '.' + locale : slug;

	let tut = cache.get(slugWithLocale);
	if (!tut || process.env.NODE_ENV !== 'production') {
		tut = get_tutorial(slug, locale);
		cache.set(slugWithLocale, tut);
	}

	if (tut) {
		send(res, 200, tut);
	} else {
		send(res, 404, { message: 'not found' });
	}
}
