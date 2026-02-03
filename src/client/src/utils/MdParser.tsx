import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeReact from "rehype-react";
import type { Root as MdastRoot } from "mdast";
import type { Root as HastRoot } from "hast";
import * as prod from 'react/jsx-runtime'


interface CardLinkProps {
    href: string;
    children: ReactNode;
  }
  
function CardLink({ href, children }: CardLinkProps) {
    const url = new URL(href);
    const id = url.searchParams.get("id");
    const color = url.searchParams.get("color");
  
    return (
      <div style={{ border: "1px solid gray", padding: "8px", margin: "4px" }}>
        <strong>{children}</strong>
        <div>ID: {id}</div>
        <div>Kolor: {color}</div>
      </div>
    );
  }

  function ViewProjects({ href, children }: CardLinkProps) {
    const url = new URL(href);
    const dataSource : string | null = url.searchParams.get("datasource");
  
    return (
      <div style={{ border: "1px solid gray", padding: "8px", margin: "4px" }}>
        <strong>{children}</strong>
        <div>DataSource: {dataSource}</div>
      </div>
    );
  }


  /** 🔹 Krok 1: Markdown → mdast */
  function parseMarkdownToMdast(source: string): MdastRoot {
    return unified()
      .use(remarkParse)
      .use(remarkGfm) // GitHub Flavored Markdown (tabele, strikethrough, itp.)
      .use(remarkMath) // Matematyka LaTeX
      .parse(source) as MdastRoot;
  }
  
  /** 🔹 Krok 2: mdast → hast */
  function transformMdastToHast(mdastTree: MdastRoot): HastRoot {
    return unified()
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw) // Parse raw HTML in markdown into proper HAST nodes
      .use(rehypeSlug) // Generuje ID dla nagłówków (dla anchor links)
      .use(rehypeKatex) // Renderowanie matematyki LaTeX
      .use(rehypeHighlight) // Podświetlanie składni kodu
      .runSync(mdastTree) as HastRoot;
  }
  
  const production = {
    Fragment: prod.Fragment, 
    jsx: prod.jsx, 
    jsxs: prod.jsxs,
    components: {
      a: (props: any) => {
        if (props.href?.startsWith("card://")) {
          return <CardLink {...props} />;
        } else if (props.href?.startsWith("view://")) {
          let url = new URL(props.href);
          console.log("View url:", url);
          switch (url.hostname) {
            case "projects": {
              return <ViewProjects {...props} />;
            }
          }
          return <CardLink {...props} />;
        }

        // Sprawdź czy to link wewnętrzny (bez protokołu lub zaczyna się od /)
        if (props.href && !props.href.startsWith('http') && !props.href.startsWith('https') && !props.href.startsWith('mailto:')) {
          // Obsługa anchor linków (zaczynających się od #)
          if (props.href.startsWith('#')) {
            return <a href={props.href} {...props} />;
          }

          // Relatywne linki - otwórz w odpowiednim widoku
          let path = props.href;
          if (path.startsWith('/')) {
            path = path.substring(1);
          }

          // Określ typ pliku i wybierz odpowiedni widok
          const isMdFile = path.endsWith('.md');
          const targetPath = isMdFile ? `/viewer/md/${path}` : `/editor/simple/${path}`;

          return <Link to={targetPath} {...props} />;
        }
        // Linki zewnętrzne używają zwykłego <a>
        return <a {...props} />;
      },
    },
  }

  /** 🔹 Krok 3: hast → React */
  function renderHastToReact(hastTree: HastRoot): ReactNode {
    /*
    const processor: any = unified()
      .use(rehypeReact, {
        createElement: React.createElement,
        Fragment: React.Fragment,
        jsx: React.createElement,
        jsxs: React.createElement,
        jsxDEV: React.createElement,
        components: {
          // Obsługa elementów void - wymagane dla React
          hr: (props: any) => <hr {...props} />,
          br: (props: any) => <br {...props} />,
          img: (props: any) => <img {...props} />,
          input: (props: any) => <input {...props} />,
          meta: (props: any) => <meta {...props} />,
          link: (props: any) => <link {...props} />,
        },
      } as any);

    return processor.stringify(hastTree) as ReactNode;
    */

    const processor =  unified()
          .use(rehypeReact, production);

    return processor.stringify(hastTree) as ReactNode;
  }
  
  /** 🔹 Główny komponent */
  export function MarkdownRenderer({ markdown }: { markdown: string }) {
    const mdast = parseMarkdownToMdast(markdown);
    console.log("MDAST:", mdast);
    const hast = transformMdastToHast(mdast);
    console.log("HAST:", hast);
    const reactContent = renderHastToReact(hast);
    // Debug – AST w konsoli
    return <div>{reactContent}</div>;
  }