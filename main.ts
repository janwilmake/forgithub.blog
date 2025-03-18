/**
 * GitHub Blog Generator Worker
 *
 * This worker transforms a GitHub repository into a blog site by:
 * 1. Finding all markdown (.md) files
 * 2. Determining a common base path for these files (excluding root md files)
 * 3. Rendering them to HTML with proper navigation
 */

export interface Env {
  // Define your environment variables here
}

// Types based on the Context API schema
interface TreeItem {
  name: string;
  path: string;
  type: "blob" | "tree";
  size?: number;
  content?: string;
}

interface RepoContents {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  tree: TreeItem[];
  files: {
    [path: string]: {
      content: string;
      size: number;
    };
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter((p) => p);

    // Need at least owner and repo
    if (pathParts.length < 2) {
      return renderHomePage();
    }

    const owner = pathParts[0];
    const repo = pathParts[1];

    // Check if we're using GitHub's URL structure
    let branch = "main";
    let remainingPath: string[] = [];

    if (pathParts.length > 2) {
      if (pathParts[2] === "tree" && pathParts.length > 3) {
        branch = pathParts[3];
        remainingPath = pathParts.slice(4);
      } else {
        branch = pathParts[2];
        remainingPath = pathParts.slice(3);
      }
    }

    // Handle static assets (CSS, JS, etc.) if needed
    if (pathParts.length > 2 && pathParts[2] === "assets") {
      // Handle asset requests if needed
      return new Response("Not implemented", { status: 404 });
    }

    try {
      // Fetch markdown files from the repo
      const apiUrl = new URL(
        `https://context.forgithub.com/${owner}/${repo}/tree/${branch}`,
      );
      apiUrl.searchParams.append("ext", "md");

      const response = await fetch(apiUrl.toString(), {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return new Response(
          `Failed to fetch repository data: ${response.statusText}`,
          {
            status: response.status,
            headers: { "Content-Type": "text/html" },
          },
        );
      }

      const repoData: RepoContents = await response.json();

      // Filter for markdown files only
      const mdFiles = Object.keys(repoData.files).filter(
        (path) => path.endsWith(".md") || path.endsWith(".mdx"),
      );

      // Filter out markdown files at the root level
      const nonRootMdFiles = mdFiles.filter((file) => file.includes("/"));

      if (nonRootMdFiles.length === 0) {
        return renderNoMarkdownPage(owner, repo);
      }

      // Find common base path (excluding root md files)
      const basePath = findCommonBasePath(nonRootMdFiles);

      // If a specific path is requested
      if (remainingPath.length > 0) {
        const requestedPath = "/" + remainingPath.join("/");

        // Check if this is a request for a specific markdown file
        const matchingFile = mdFiles.find(
          (file) =>
            file === requestedPath ||
            (requestedPath.endsWith(".md")
              ? false
              : file === requestedPath + ".md") ||
            file.startsWith(requestedPath),
        );

        if (matchingFile) {
          return renderMarkdownPage(
            owner,
            repo,
            branch,
            matchingFile,
            repoData.files[matchingFile].content,
            nonRootMdFiles,
            basePath,
          );
        }
      }

      // Otherwise, render the index/first blog post
      const sortedPosts = sortByDateIfPossible(nonRootMdFiles);
      const firstPost = sortedPosts[0];

      return renderMarkdownPage(
        owner,
        repo,
        branch,
        firstPost,
        repoData.files[firstPost].content,
        nonRootMdFiles,
        basePath,
      );
    } catch (error) {
      return new Response(`Error processing request: ${error.message}`, {
        status: 500,
        headers: { "Content-Type": "text/html" },
      });
    }
  },
};

/**
 * Sort files by date if they contain date patterns
 */
function sortByDateIfPossible(files: string[]): string[] {
  return files.sort((a, b) => {
    // Try to extract dates from filenames or paths
    const dateRegex = /(\d{4}[-/]\d{2}[-/]\d{2})|(\d{4}[-/]\d{2})/;
    const dateA = a.match(dateRegex);
    const dateB = b.match(dateRegex);

    if (dateA && dateB) {
      return new Date(dateB[0]).getTime() - new Date(dateA[0]).getTime(); // Descending order
    }

    // Fallback to alphabetical sorting
    return a.localeCompare(b);
  });
}

/**
 * Find the common base path for a set of markdown files
 */
function findCommonBasePath(files: string[]): string {
  if (files.length === 0) return "";

  // Split all paths into parts
  const pathParts = files.map((file) => file.split("/").slice(0, -1)); // Remove filename

  // Find the shortest path to avoid index out of bounds
  const minLength = Math.min(...pathParts.map((parts) => parts.length));

  let commonBase: string[] = [];

  // Check each path segment
  for (let i = 0; i < minLength; i++) {
    const segment = pathParts[0][i];

    // Check if this segment is common across all paths
    if (pathParts.every((parts) => parts[i] === segment)) {
      commonBase.push(segment);
    } else {
      break;
    }
  }

  return commonBase.join("/");
}

/**
 * Render the markdown content as HTML
 */
function renderMarkdown(markdown: string): string {
  // Simple markdown to HTML conversion
  // For a real solution, you'd want to use a proper markdown library

  // Convert headings
  let html = markdown
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>");

  // Convert paragraphs
  html = html.replace(/^\s*(\n)?(.+)/gm, function (m) {
    return /\<(\/)?(h|ul|ol|li|blockquote|pre|img)/.test(m)
      ? m
      : "<p>" + m + "</p>";
  });

  // Convert bold/italic
  html = html
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(
      /\[(.*?)\]\((.*?)\)/g,
      '<a href="$2" class="text-pink-400 hover:text-pink-300">$1</a>',
    );

  // Convert code blocks
  html = html.replace(
    /```([\s\S]*?)```/g,
    '<pre class="bg-gray-800 p-4 rounded-md overflow-x-auto"><code>$1</code></pre>',
  );

  // Convert inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-gray-800 px-1 rounded">$1</code>',
  );

  // Convert lists
  html = html.replace(/^\s*\* (.*$)/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n)+/g, "<ul>$&</ul>");

  html = html.replace(/^\s*\d+\. (.*$)/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n)+/g, "<ol>$&</ol>");

  return html;
}

/**
 * Extract SEO metadata from content
 */
function extractSEOData(
  content: string,
  path: string,
): { title: string; description: string; date: string } {
  // Extract title from the markdown (first heading)
  const titleMatch = content.match(/^#\s+(.*)$/m);
  const title = titleMatch
    ? titleMatch[1]
    : path.split("/").pop()!.replace(".md", "");

  // Extract possible description (first paragraph after the title)
  let description = "";
  const descriptionRegex = /^#\s+.*$([\s\S]*?)(?:^#|$)/m;
  const contentAfterTitle = content.match(descriptionRegex);

  if (contentAfterTitle && contentAfterTitle[1]) {
    const paragraphMatch = contentAfterTitle[1].match(
      /(?:^|\n)([^#\n].*?)(?:\n\n|$)/,
    );
    if (paragraphMatch) {
      description = paragraphMatch[1]
        .trim()
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1");
    }
  }

  // Fallback to first paragraph if no description found
  if (!description) {
    const firstParagraphMatch = content.match(/(?:^|\n)([^#\n].*?)(?:\n\n|$)/);
    if (firstParagraphMatch) {
      description = firstParagraphMatch[1]
        .trim()
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1");
    }
  }

  // Get file creation date if available, or use current date
  const dateMatch = path.match(/(\d{4}[-/]\d{2}[-/]\d{2})|(\d{4}[-/]\d{2})/);
  const date = dateMatch
    ? dateMatch[0].replace(/[-/]/g, "-")
    : new Date().toISOString().split("T")[0];

  return { title, description, date };
}

/**
 * Process content to remove the first h1 (as it will be displayed in the header)
 */
function processContent(content: string): string {
  // Remove the first h1 heading
  return content.replace(/^#\s+.*$\n+/m, "");
}

/**
 * Render the home page when no repo is specified
 */
function renderHomePage(): Response {
  const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>GitHub Blog Generator</title>
          <meta name="description" content="Transform any GitHub repository with markdown files into a beautiful blog site.">
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            tailwind.config = {
              darkMode: 'class',
              theme: {
                extend: {
                  colors: {
                    primary: {
                      DEFAULT: '#8B5CF6',
                      dark: '#7C3AED'
                    },
                    secondary: {
                      DEFAULT: '#EC4899',
                      dark: '#DB2777'
                    }
                  }
                }
              }
            }
          </script>
        </head>
        <body class="bg-gray-900 text-gray-100 min-h-screen">
          <div class="container mx-auto px-4 py-12">
            <div class="max-w-2xl mx-auto text-center">
              <h1 class="text-4xl font-bold mb-6 bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">GitHub Blog Generator</h1>
              <p class="text-xl mb-8">Transform any GitHub repository into a beautiful blog site.</p>
              
              <form class="flex flex-col space-y-4 mt-8" onsubmit="navigateToRepo(event)">
                <div class="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                  <input type="text" id="owner" placeholder="GitHub Username" 
                         class="flex-1 px-4 py-2 rounded-md bg-gray-800 border border-gray-700 focus:outline-none focus:ring focus:ring-purple-500" required>
                  <input type="text" id="repo" placeholder="Repository Name" 
                         class="flex-1 px-4 py-2 rounded-md bg-gray-800 border border-gray-700 focus:outline-none focus:ring focus:ring-purple-500" required>
                </div>
                <div class="flex">
                  <input type="text" id="branch" placeholder="Branch (default: main)" 
                         class="flex-1 px-4 py-2 rounded-md bg-gray-800 border border-gray-700 focus:outline-none focus:ring focus:ring-purple-500">
                </div>
                <button type="submit" 
                        class="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-6 py-3 rounded-md font-medium hover:opacity-90 transition-opacity">
                  Generate Blog
                </button>
              </form>
              
              <div class="mt-12 text-gray-400">
                <p>Enter a GitHub username and repository to get started.</p>
                <p class="mt-2">Only repositories with markdown files will be rendered correctly.</p>
              </div>
            </div>
          </div>
    
          <script>
            function navigateToRepo(event) {
              event.preventDefault();
              const owner = document.getElementById('owner').value;
              const repo = document.getElementById('repo').value;
              const branch = document.getElementById('branch').value || 'main';
              
              if (owner && repo) {
                window.location.href = \`/\${owner}/\${repo}/tree/\${branch}\`;
              }
            }
          </script>
        </body>
        </html>
      `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}

/**
 * Render a page when no markdown files are found
 */
function renderNoMarkdownPage(owner: string, repo: string): Response {
  const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>No Markdown Files | ${owner}/${repo}</title>
          <meta name="description" content="No markdown files found in this repository's subdirectories.">
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            tailwind.config = {
              darkMode: 'class',
              theme: {
                extend: {
                  colors: {
                    primary: {
                      DEFAULT: '#8B5CF6',
                      dark: '#7C3AED'
                    },
                    secondary: {
                      DEFAULT: '#EC4899',
                      dark: '#DB2777'
                    }
                  }
                }
              }
            }
          </script>
        </head>
        <body class="bg-gray-900 text-gray-100 min-h-screen">
          <div class="container mx-auto px-4 py-12">
            <div class="max-w-2xl mx-auto text-center">
              <h1 class="text-2xl font-bold mb-6">No Markdown Files Found</h1>
              <p class="mb-8">The repository <span class="text-pink-400">${owner}/${repo}</span> doesn't contain any markdown files in subdirectories.</p>
              
              <a href="/" class="inline-block bg-gradient-to-r from-pink-500 to-purple-600 text-white px-6 py-3 rounded-md font-medium hover:opacity-90 transition-opacity">
                Back to Home
              </a>
            </div>
          </div>
        </body>
        </html>
      `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}

/**
 * Render a markdown page as HTML
 */
function renderMarkdownPage(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  allFiles: string[],
  basePath: string,
): Response {
  // Extract SEO data
  const { title, description, date } = extractSEOData(content, path);

  // Process content to remove first h1
  const processedContent = processContent(content);

  // Render the content
  const renderedContent = renderMarkdown(processedContent);

  // Build the navigation tree
  const navigationTree = buildNavigationTree(
    allFiles,
    basePath,
    owner,
    repo,
    branch,
    path,
  );

  const canonicalUrl = `/${owner}/${repo}/tree/${branch}/${path}`;
  const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${path}`;

  const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title} | ${owner}/${repo}</title>
          <meta name="description" content="${description.substring(0, 160)}">
          <link rel="canonical" href="${canonicalUrl}">
          <meta property="og:title" content="${title}">
          <meta property="og:description" content="${description.substring(
            0,
            160,
          )}">
          <meta property="og:type" content="article">
          <meta property="og:url" content="${canonicalUrl}">
          <meta name="twitter:card" content="summary">
          <meta name="twitter:title" content="${title}">
          <meta name="twitter:description" content="${description.substring(
            0,
            160,
          )}">
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            tailwind.config = {
              darkMode: 'class',
              theme: {
                extend: {
                  colors: {
                    primary: {
                      DEFAULT: '#8B5CF6',
                      dark: '#7C3AED'
                    },
                    secondary: {
                      DEFAULT: '#EC4899',
                      dark: '#DB2777'
                    }
                  }
                }
              }
            }
          </script>
          <style>
            /* Additional custom styles */
            .prose h1, .prose h2, .prose h3 {
              color: #F5F5F5;
              margin-top: 1.5rem;
              margin-bottom: 1rem;
            }
            .prose h1 {
              font-size: 2rem;
              font-weight: 700;
              border-bottom: 1px solid #4B5563;
              padding-bottom: 0.5rem;
              margin-bottom: 1.5rem;
            }
            .prose h2 {
              font-size: 1.5rem;
              font-weight: 600;
              margin-top: 2rem;
            }
            .prose h3 {
              font-size: 1.25rem;
              font-weight: 600;
            }
            .prose p {
              margin-bottom: 1rem;
              line-height: 1.7;
            }
            .prose code {
              background-color: #374151;
              padding: 0.2em 0.4em;
              border-radius: 0.25rem;
              font-size: 0.875em;
            }
            .prose pre {
              margin: 1.5rem 0;
              overflow-x: auto;
            }
            .prose a {
              color: #EC4899;
              text-decoration: none;
            }
            .prose a:hover {
              text-decoration: underline;
            }
            .prose ul, .prose ol {
              margin: 1rem 0;
              padding-left: 1.5rem;
            }
            .prose li {
              margin-bottom: 0.5rem;
            }
            .prose ul li {
              list-style-type: disc;
            }
            .prose ol li {
              list-style-type: decimal;
            }
            .nav-sidebar {
              max-height: calc(100vh - 8rem);
              overflow-y: auto;
              scrollbar-width: thin;
              scrollbar-color: #4B5563 #1F2937;
            }
            .nav-sidebar::-webkit-scrollbar {
              width: 6px;
            }
            .nav-sidebar::-webkit-scrollbar-track {
              background: #1F2937;
            }
            .nav-sidebar::-webkit-scrollbar-thumb {
              background-color: #4B5563;
              border-radius: 6px;
            }
          </style>
        </head>
        <body class="bg-gray-900 text-gray-200">
          <header class="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
            <div class="container mx-auto px-4 py-4">
              <div class="flex items-center justify-between">
                <div>
                  <a href="/${owner}/${repo}/tree/${branch}" class="flex items-center">
                    <span class="text-xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
                      ${owner}/${repo}
                    </span>
                  </a>
                </div>
                <nav>
                  <a href="/" class="text-gray-300 hover:text-white px-3 py-2">Home</a>
                  <a href="https://github.com/${owner}/${repo}" class="text-gray-300 hover:text-white px-3 py-2" target="_blank">GitHub</a>
                </nav>
              </div>
            </div>
          </header>
          
          <main class="container mx-auto px-4 py-8">
            <div class="flex flex-col md:flex-row gap-8">
              <!-- Main content -->
              <div class="md:w-3/4">
                <article class="bg-gray-800 rounded-lg shadow-lg p-6 prose prose-invert max-w-none">
                  <header class="mb-8">
                    <div class="text-gray-400 mb-2">${formatDate(date)}</div>
                    <h1 class="text-3xl font-bold text-white">${title}</h1>
                    ${
                      description
                        ? `<p class="text-gray-300 mt-4">${description}</p>`
                        : ""
                    }
                  </header>
                  
                  <div class="prose prose-lg prose-invert max-w-none">
                    ${renderedContent}
                  </div>
                  
                  <footer class="mt-12 pt-6 border-t border-gray-700">
                    <div class="flex items-center text-sm text-gray-400">
                      <span>Source: <a href="${githubUrl}" 
                         class="text-pink-400 hover:underline" target="_blank">
                        ${path}
                      </a></span>
                    </div>
                  </footer>
                </article>
              </div>
              
              <!-- Sidebar with navigation -->
              <div class="md:w-1/4 mt-8 md:mt-0">
                <div class="bg-gray-800 rounded-lg shadow-lg p-4 sticky top-20">
                  <h3 class="text-xl font-bold mb-4 text-gray-100">Navigation</h3>
                  <div class="text-sm nav-sidebar">
                    ${navigationTree}
                  </div>
                </div>
              </div>
            </div>
          </main>
          
          <footer class="bg-gray-800 border-t border-gray-700 py-8 mt-8">
            <div class="container mx-auto px-4 text-center text-gray-400 text-sm">
              <p>Generated from <a href="https://github.com/${owner}/${repo}" class="text-pink-400 hover:underline">${owner}/${repo}</a> using Context API</p>
              <p class="mt-2">Powered by <a href="https://context.forgithub.com" class="text-pink-400 hover:underline">context.forgithub.com</a></p>
            </div>
          </footer>
        </body>
        </html>
      `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}

/**
 * Build a navigation tree from all markdown files
 */
function buildNavigationTree(
  files: string[],
  basePath: string,
  owner: string,
  repo: string,
  branch: string,
  currentPath: string,
): string {
  // Group files by directories
  const tree: { __files?: any } = {};

  for (const file of files) {
    // Skip files not in the base path
    if (basePath && !file.startsWith(basePath)) continue;

    // Remove the base path to get the relative path
    const relativePath = basePath ? file.substring(basePath.length + 1) : file;
    const parts = relativePath.split("/");

    let current = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = { __files: [] };
      }
      current = current[part];
    }

    // Add the file
    const fileName = parts[parts.length - 1];
    current.__files = current.__files || [];
    current.__files.push({
      name: fileName,
      path: file,
    });
  }

  // Render the tree as HTML
  function renderTree(node, path = "") {
    let html = '<ul class="pl-4 space-y-1">';

    // First render directories
    for (const key of Object.keys(node).filter((k) => k !== "__files")) {
      const newPath = path ? `${path}/${key}` : key;
      html += `
            <li class="font-medium text-gray-300">
              <div class="flex items-center">
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                </svg>
                ${key}
              </div>
              ${renderTree(node[key], newPath)}
            </li>
          `;
    }

    // Then render files
    if (node.__files) {
      for (const file of node.__files) {
        const isActive = currentPath === file.path;
        const fileName = file.name.replace(".md", "");
        const url = `/${owner}/${repo}/tree/${branch}/${file.path}`;

        html += `
              <li>
                <a href="${url}" class="pl-5 block py-1 text-gray-${
          isActive
            ? "100 font-medium bg-gray-700 rounded"
            : "400 hover:text-pink-400"
        } truncate">
                  ${fileName}
                </a>
              </li>
            `;
      }
    }

    html += "</ul>";
    return html;
  }

  return renderTree(tree);
}

/**
 * Format a date string to a more readable format
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr; // Return the original string if invalid
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
