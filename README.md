I want to make a nice worker that turns any GitHub repo into a blogpost. it filters finding only md files, then takes the common base path for all of these (excluding all md files at the root). for example, this could be /blog/2025/
it then uses uses markdown to html rendering to output a html at /path/to/mdfile (from the base path). also, on the bottom of the page, a tree for all files is shown, that allow navigation.
respond with a ts cloudflare worker that implements this using context.forgithub.com api without any auth (for now). ensure to use cdn.tailwindcss.com script and vanilla html as much as possible and a dark mode theme with pink/purple colors theme

ensure the script:

- the navigation on the right must be scrolling individually
- just show the h1 once
- add proper SEO
- use GitHub url structure, e.g. /owner/repo/tree/branch
