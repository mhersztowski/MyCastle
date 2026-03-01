import React, { useState, useMemo } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  TextField,
  Chip,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  Link,
  Divider,
  InputAdornment,
} from '@mui/material';
// Kind indicator as styled letter badge (no @mui/icons-material dependency)
function KindBadge({ letter, color }: { letter: string; color: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        borderRadius: '4px',
        bgcolor: color,
        color: '#fff',
        fontSize: '0.7rem',
        fontWeight: 700,
        fontFamily: 'monospace',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {letter}
    </Box>
  );
}
import type {
  TypeDocProject,
  TypeDocReflection,
  TypeDocType,
  TypeDocSignature,
  TypeDocComment,
} from './types';
import { ReflectionKind, KIND_LABELS, KIND_ORDER } from './types';

// --- Helpers ---

function getCommentText(comment?: TypeDocComment): string {
  if (!comment?.summary) return '';
  return comment.summary.map((s) => s.text).join('');
}

function hasSubModules(mod: TypeDocReflection): boolean {
  return mod.children?.every((c) => c.kind === ReflectionKind.Module) ?? false;
}

function collectExports(mod: TypeDocReflection): TypeDocReflection[] {
  const exports: TypeDocReflection[] = [];
  for (const child of mod.children ?? []) {
    if (child.kind === ReflectionKind.Module) {
      for (const sub of child.children ?? []) {
        if (sub.kind !== ReflectionKind.Module) {
          exports.push(sub);
        }
      }
    } else {
      exports.push(child);
    }
  }
  return exports;
}

function getSubModules(mod: TypeDocReflection): TypeDocReflection[] {
  return (mod.children ?? []).filter((c) => c.kind === ReflectionKind.Module);
}

function buildIdIndex(project: TypeDocProject): Map<number, TypeDocReflection> {
  const index = new Map<number, TypeDocReflection>();
  function walk(node: TypeDocReflection) {
    index.set(node.id, node);
    node.children?.forEach(walk);
  }
  project.children?.forEach(walk);
  return index;
}

function resolveReflection(reflection: TypeDocReflection, idIndex: Map<number, TypeDocReflection>): TypeDocReflection {
  if (reflection.variant === 'reference' && typeof reflection.target === 'number') {
    const target = idIndex.get(reflection.target);
    if (target) return { ...target, name: reflection.name, sources: reflection.sources ?? target.sources };
  }
  return reflection;
}

function hasNestedMethods(prop: TypeDocReflection): boolean {
  const decl = prop.type?.declaration;
  if (!decl?.children) return false;
  return decl.children.some((c) => c.kind === 2048 || c.signatures);
}

function getKindIcon(kind: number): React.ReactNode {
  const color = getKindColor(kind);
  switch (kind) {
    case ReflectionKind.Interface: return <KindBadge letter="I" color={color} />;
    case ReflectionKind.Class: return <KindBadge letter="C" color={color} />;
    case ReflectionKind.Enum: return <KindBadge letter="E" color={color} />;
    case ReflectionKind.Function: return <KindBadge letter="F" color={color} />;
    case ReflectionKind.TypeAlias: return <KindBadge letter="T" color={color} />;
    case ReflectionKind.Variable: return <KindBadge letter="V" color={color} />;
    default: return null;
  }
}

function getKindColor(kind: number): string {
  switch (kind) {
    case ReflectionKind.Interface: return '#2196f3';
    case ReflectionKind.Class: return '#ff9800';
    case ReflectionKind.Enum: return '#9c27b0';
    case ReflectionKind.Function: return '#4caf50';
    case ReflectionKind.TypeAlias: return '#00bcd4';
    case ReflectionKind.Variable: return '#795548';
    default: return '#757575';
  }
}

// --- Type Renderer ---

function TypeRenderer({ type }: { type?: TypeDocType }): React.ReactElement {
  if (!type) return <span>unknown</span>;

  switch (type.type) {
    case 'intrinsic':
      return <span style={{ color: '#2196f3' }}>{type.name}</span>;

    case 'literal':
      if (typeof type.value === 'string') return <span style={{ color: '#4caf50' }}>"{type.value}"</span>;
      return <span style={{ color: '#ff9800' }}>{String(type.value)}</span>;

    case 'reference':
      return (
        <span style={{ color: '#e91e63' }}>
          {type.name}
          {type.typeArguments && type.typeArguments.length > 0 && (
            <>{'<'}{type.typeArguments.map((ta, i) => (
              <React.Fragment key={i}>
                {i > 0 && ', '}
                <TypeRenderer type={ta} />
              </React.Fragment>
            ))}{'>'}</>
          )}
        </span>
      );

    case 'array':
      return <><TypeRenderer type={type.elementType} />[]</>;

    case 'union':
      return (
        <>
          {type.types?.map((t, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: '#999' }}> | </span>}
              <TypeRenderer type={t} />
            </React.Fragment>
          ))}
        </>
      );

    case 'intersection':
      return (
        <>
          {type.types?.map((t, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: '#999' }}> & </span>}
              <TypeRenderer type={t} />
            </React.Fragment>
          ))}
        </>
      );

    case 'tuple':
      return (
        <>
          [
          {type.types?.map((t, i) => (
            <React.Fragment key={i}>
              {i > 0 && ', '}
              <TypeRenderer type={t} />
            </React.Fragment>
          ))}
          ]
        </>
      );

    case 'reflection':
      if (type.declaration?.signatures) {
        const sig = type.declaration.signatures[0];
        return (
          <>
            ({sig.parameters?.map((p, i) => (
              <React.Fragment key={i}>
                {i > 0 && ', '}
                {p.name}: <TypeRenderer type={p.type} />
              </React.Fragment>
            ))}) =&gt; <TypeRenderer type={sig.type} />
          </>
        );
      }
      if (type.declaration?.children) {
        return (
          <>
            {'{ '}
            {type.declaration.children.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && '; '}
                {c.name}{c.flags.isOptional && '?'}: <TypeRenderer type={c.type} />
              </React.Fragment>
            ))}
            {' }'}
          </>
        );
      }
      return <span>object</span>;

    case 'mapped':
      return <span style={{ color: '#999' }}>{'{ [mapped] }'}</span>;

    case 'indexedAccess':
      return <><TypeRenderer type={type.objectType} />[<TypeRenderer type={type.indexType} />]</>;

    case 'query':
      return <>typeof <TypeRenderer type={type.queryType} /></>;

    case 'typeOperator':
      return <>{type.operator} <TypeRenderer type={type.target as unknown as TypeDocType} /></>;

    case 'conditional':
      return (
        <>
          <TypeRenderer type={type.checkType} /> extends <TypeRenderer type={type.extendsType} />
          {' ? '}<TypeRenderer type={type.trueType} />
          {' : '}<TypeRenderer type={type.falseType} />
        </>
      );

    default:
      return <span style={{ color: '#999' }}>{type.type}{type.name ? `: ${type.name}` : ''}</span>;
  }
}

// --- Signature View ---

function SignatureView({ signature }: { signature: TypeDocSignature }) {
  const comment = getCommentText(signature.comment);
  return (
    <Box sx={{ ml: 2, mb: 1 }}>
      <Box sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
        ({signature.parameters?.map((p, i) => (
          <React.Fragment key={i}>
            {i > 0 && ', '}
            <span>{p.name}{p.flags.isOptional && '?'}</span>
            {p.type && <>: <TypeRenderer type={p.type} /></>}
          </React.Fragment>
        ))}): <TypeRenderer type={signature.type} />
      </Box>
      {comment && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {comment}
        </Typography>
      )}
      {signature.parameters && signature.parameters.length > 0 && (
        <Table size="small" sx={{ mt: 1, '& td, & th': { py: 0.25, px: 1 } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 150 }}>Parameter</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {signature.parameters.map((p) => (
              <TableRow key={p.id}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {p.name}{p.flags.isOptional && <Chip label="?" size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.7rem' }} />}
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  <TypeRenderer type={p.type} />
                </TableCell>
                <TableCell>{getCommentText(p.comment)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

// --- Properties Table ---

function NestedMethodsView({ prop }: { prop: TypeDocReflection }) {
  const decl = prop.type?.declaration;
  if (!decl?.children) return null;

  const methods = decl.children.filter((c) => c.kind === 2048 || c.signatures);
  const props = decl.children.filter((c) => c.kind === ReflectionKind.Property && !c.signatures);

  return (
    <Box sx={{ ml: 2, mt: 0.5, mb: 1, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
      {props.length > 0 && (
        <Box sx={{ mb: 1 }}>
          {props.map((p) => (
            <Box key={p.id ?? p.name} sx={{ fontFamily: 'monospace', fontSize: '0.8rem', py: 0.25 }}>
              <span style={{ fontWeight: 500 }}>{p.name}</span>
              {p.flags.isOptional && '?'}: <TypeRenderer type={p.type} />
              {getCommentText(p.comment) && (
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1, fontSize: '0.75rem' }}>
                  — {getCommentText(p.comment)}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
      {methods.map((method) => (
        <Box key={method.id ?? method.name} sx={{ mb: 1 }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>
            {method.name}()
          </Typography>
          {(method.signatures ?? []).map((sig, i) => (
            <SignatureView key={sig.id ?? i} signature={sig} />
          ))}
        </Box>
      ))}
    </Box>
  );
}

function PropertiesTable({ properties }: { properties: TypeDocReflection[] }) {
  const [expandedProps, setExpandedProps] = useState<Record<string, boolean>>({});

  return (
    <Table size="small" sx={{ '& td, & th': { py: 0.5, px: 1 } }}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 600, width: 200 }}>Name</TableCell>
          <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
          <TableCell sx={{ fontWeight: 600, width: 80 }}>Flags</TableCell>
          <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {properties.map((prop) => {
          const nested = hasNestedMethods(prop);
          const isExpanded = expandedProps[prop.name];
          return (
            <React.Fragment key={prop.id}>
              <TableRow
                sx={nested ? { cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } } : {}}
                onClick={() => nested && setExpandedProps((prev) => ({ ...prev, [prop.name]: !prev[prop.name] }))}
              >
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 500 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {nested && <span style={{ fontSize: 10 }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>}
                    {prop.name}
                  </Box>
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {nested ? (
                    <Chip label={`${prop.type?.declaration?.children?.length ?? 0} members`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  ) : (
                    <TypeRenderer type={prop.type} />
                  )}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {prop.flags.isOptional && <Chip label="optional" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
                    {prop.flags.isReadonly && <Chip label="readonly" size="small" sx={{ height: 18, fontSize: '0.65rem' }} color="info" />}
                    {prop.flags.isStatic && <Chip label="static" size="small" sx={{ height: 18, fontSize: '0.65rem' }} color="warning" />}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontSize="0.8rem">{getCommentText(prop.comment)}</Typography>
                </TableCell>
              </TableRow>
              {nested && isExpanded && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ p: 0 }}>
                    <NestedMethodsView prop={prop} />
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

// --- Reflection Card ---

function ReflectionCard({ reflection: rawReflection, idIndex }: { reflection: TypeDocReflection; idIndex: Map<number, TypeDocReflection> }) {
  const reflection = resolveReflection(rawReflection, idIndex);
  const [expanded, setExpanded] = useState(false);
  const comment = getCommentText(reflection.comment);
  const source = reflection.sources?.[0];

  const properties = reflection.children?.filter((c) => c.kind === ReflectionKind.Property) ?? [];
  const methods = reflection.children?.filter((c) => c.kind === ReflectionKind.Method) ?? [];
  const enumMembers = reflection.children?.filter((c) => c.kind === ReflectionKind.EnumMember) ?? [];
  const constructor = reflection.children?.find((c) => c.kind === ReflectionKind.Constructor);

  const hasDetails = properties.length > 0 || methods.length > 0 || enumMembers.length > 0
    || constructor || reflection.signatures;

  return (
    <Paper variant="outlined" sx={{ mb: 1 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1.5,
          py: 0.75,
          cursor: hasDetails ? 'pointer' : 'default',
          '&:hover': hasDetails ? { bgcolor: 'action.hover' } : {},
        }}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <Box sx={{ color: getKindColor(reflection.kind), mr: 1, display: 'flex' }}>
          {getKindIcon(reflection.kind)}
        </Box>
        <Typography
          variant="body1"
          sx={{ fontFamily: 'monospace', fontWeight: 600, flexGrow: 1 }}
        >
          {reflection.name}
        </Typography>
        {reflection.extendedTypes && reflection.extendedTypes.length > 0 && (
          <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary', mx: 1 }}>
            extends {reflection.extendedTypes.map((t, i) => (
              <React.Fragment key={i}>
                {i > 0 && ', '}
                <TypeRenderer type={t} />
              </React.Fragment>
            ))}
          </Typography>
        )}
        {reflection.kind === ReflectionKind.TypeAlias && reflection.type && (
          <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary', mx: 1, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            = <TypeRenderer type={reflection.type} />
          </Typography>
        )}
        {source?.url && (
          <Link href={source.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} sx={{ ml: 1 }}>
            <Typography component="span" sx={{ fontSize: 14, lineHeight: 1 }}>&#x2197;</Typography>
          </Link>
        )}
        {hasDetails && (
          <IconButton size="small" sx={{ ml: 0.5 }}>
            {expanded ? <span>&#x25B2;</span> : <span>&#x25BC;</span>}
          </IconButton>
        )}
      </Box>

      {comment && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, pb: 0.75 }}>
          {comment}
        </Typography>
      )}

      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ px: 1.5, py: 1 }}>
          {/* Function/TypeAlias signatures */}
          {reflection.signatures && reflection.signatures.length > 0 && (
            <Box sx={{ mb: 1 }}>
              {reflection.signatures.map((sig) => (
                <SignatureView key={sig.id} signature={sig} />
              ))}
            </Box>
          )}

          {/* Enum members */}
          {enumMembers.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Members</Typography>
              <Table size="small" sx={{ '& td, & th': { py: 0.25, px: 1 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {enumMembers.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.name}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        <TypeRenderer type={m.type} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          {/* Constructor */}
          {constructor?.signatures && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Constructor</Typography>
              {constructor.signatures.map((sig) => (
                <SignatureView key={sig.id} signature={sig} />
              ))}
            </Box>
          )}

          {/* Properties */}
          {properties.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Properties ({properties.length})</Typography>
              <PropertiesTable properties={properties} />
            </Box>
          )}

          {/* Methods */}
          {methods.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Methods ({methods.length})</Typography>
              {methods.map((method) => (
                <Box key={method.id} sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {method.name}
                    </Typography>
                    {method.flags.isStatic && <Chip label="static" size="small" sx={{ height: 18, fontSize: '0.65rem' }} color="warning" />}
                    {method.sources?.[0]?.url && (
                      <Link href={method.sources[0].url} target="_blank" rel="noopener">
                        <Typography component="span" sx={{ fontSize: 12, lineHeight: 1 }}>&#x2197;</Typography>
                      </Link>
                    )}
                  </Box>
                  {method.signatures?.map((sig) => (
                    <SignatureView key={sig.id} signature={sig} />
                  ))}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// --- Grouped exports view ---

function GroupedExportsView({ exports, searchQuery, idIndex }: { exports: TypeDocReflection[]; searchQuery: string; idIndex: Map<number, TypeDocReflection> }) {
  const groupedChildren = useMemo(() => {
    const groups: Record<number, TypeDocReflection[]> = {};
    for (const child of exports) {
      if (!KIND_LABELS[child.kind]) continue;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = child.name.toLowerCase().includes(q);
        const childMatch = child.children?.some((c) => c.name.toLowerCase().includes(q));
        if (!nameMatch && !childMatch) continue;
      }
      if (!groups[child.kind]) groups[child.kind] = [];
      groups[child.kind].push(child);
    }
    return groups;
  }, [exports, searchQuery]);

  const totalCount = Object.values(groupedChildren).reduce((sum, arr) => sum + arr.length, 0);

  if (totalCount === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          {searchQuery ? 'No items matching filter' : 'No documented exports'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {KIND_ORDER.map((kind) => {
        const items = groupedChildren[kind];
        if (!items || items.length === 0) return null;
        return (
          <Box key={kind} sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ color: getKindColor(kind), display: 'flex' }}>{getKindIcon(kind)}</Box>
              {KIND_LABELS[kind]}
              <Chip label={items.length} size="small" />
            </Typography>
            {items.map((item) => (
              <ReflectionCard key={item.id} reflection={item} idIndex={idIndex} />
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

// --- Module View (handles both flat and nested sub-module structures) ---

function ModuleView({ module, selectedSubModule, searchQuery, idIndex }: { module: TypeDocReflection; selectedSubModule: TypeDocReflection | null; searchQuery: string; idIndex: Map<number, TypeDocReflection> }) {
  const isNested = hasSubModules(module);

  if (isNested && selectedSubModule) {
    const exports = collectExports(selectedSubModule);
    return <GroupedExportsView exports={exports.length > 0 ? exports : selectedSubModule.children ?? []} searchQuery={searchQuery} idIndex={idIndex} />;
  }

  if (isNested) {
    const allExports = collectExports(module);
    return <GroupedExportsView exports={allExports} searchQuery={searchQuery} idIndex={idIndex} />;
  }

  return <GroupedExportsView exports={module.children ?? []} searchQuery={searchQuery} idIndex={idIndex} />;
}

// --- Main Viewer ---

export interface TypeDocViewerProps {
  data: TypeDocProject;
}

const SIDEBAR_WIDTH = 260;

export function TypeDocViewer({ data }: TypeDocViewerProps) {
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [selectedSubModuleId, setSelectedSubModuleId] = useState<number | null>(null);
  const [expandedModules, setExpandedModules] = useState<Record<number, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const idIndex = useMemo(() => buildIdIndex(data), [data]);

  const modules = useMemo(() =>
    (data.children ?? []).filter((c) => c.kind === ReflectionKind.Module),
    [data],
  );

  const selectedModule = useMemo(() =>
    modules.find((m) => m.id === selectedModuleId) ?? modules[0] ?? null,
    [modules, selectedModuleId],
  );

  const selectedSubModule = useMemo(() => {
    if (!selectedModule || !selectedSubModuleId) return null;
    return getSubModules(selectedModule).find((s) => s.id === selectedSubModuleId) ?? null;
  }, [selectedModule, selectedSubModuleId]);

  const filteredModules = useMemo(() => {
    if (!searchQuery) return modules;
    const q = searchQuery.toLowerCase();
    return modules.filter((m) => {
      if (m.name.toLowerCase().includes(q)) return true;
      const exports = hasSubModules(m) ? collectExports(m) : m.children ?? [];
      return exports.some((c) => c.name.toLowerCase().includes(q));
    });
  }, [modules, searchQuery]);

  const handleSelectModule = (modId: number) => {
    setSelectedModuleId(modId);
    setSelectedSubModuleId(null);
    const mod = modules.find((m) => m.id === modId);
    if (mod && hasSubModules(mod)) {
      setExpandedModules((prev) => ({ ...prev, [modId]: !prev[modId] }));
    }
  };

  const handleSelectSubModule = (subId: number) => {
    setSelectedSubModuleId(subId);
  };

  const getExportCount = (mod: TypeDocReflection): number => {
    if (hasSubModules(mod)) return collectExports(mod).length;
    return mod.children?.length ?? 0;
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Sidebar */}
      <Box
        sx={{
          width: SIDEBAR_WIDTH,
          minWidth: SIDEBAR_WIDTH,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Typography fontSize="small" color="action.active" sx={{ fontFamily: 'monospace' }}>&#x2315;</Typography>
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <List sx={{ overflow: 'auto', flexGrow: 1 }} dense>
          {filteredModules.map((mod) => {
            const nested = hasSubModules(mod);
            const isExpanded = expandedModules[mod.id];
            const subModules = nested ? getSubModules(mod) : [];

            return (
              <React.Fragment key={mod.id}>
                <ListItem disablePadding>
                  <ListItemButton
                    selected={selectedModule?.id === mod.id && !selectedSubModuleId}
                    onClick={() => handleSelectModule(mod.id)}
                  >
                    <ListItemText
                      primary={mod.name}
                      secondary={`${getExportCount(mod)} exports${nested ? ` / ${subModules.length} files` : ''}`}
                      primaryTypographyProps={{ fontSize: '0.85rem', noWrap: true }}
                      secondaryTypographyProps={{ fontSize: '0.7rem' }}
                    />
                    {nested && (
                      <span style={{ fontSize: 12, color: '#999' }}>
                        {isExpanded ? '\u25B2' : '\u25BC'}
                      </span>
                    )}
                  </ListItemButton>
                </ListItem>
                {nested && isExpanded && (
                  <Collapse in={isExpanded}>
                    <List disablePadding dense>
                      {subModules.map((sub) => (
                        <ListItem key={sub.id} disablePadding>
                          <ListItemButton
                            sx={{ pl: 3 }}
                            selected={selectedSubModuleId === sub.id}
                            onClick={() => {
                              setSelectedModuleId(mod.id);
                              handleSelectSubModule(sub.id);
                            }}
                          >
                            <ListItemText
                              primary={sub.name}
                              primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true, color: 'text.secondary' }}
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                )}
              </React.Fragment>
            );
          })}
        </List>
      </Box>

      {/* Main content */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        {selectedModule ? (
          <>
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography variant="h5" sx={{ fontFamily: 'monospace' }}>
                {selectedModule.name}
                {selectedSubModule && (
                  <Typography component="span" variant="h6" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {' / '}{selectedSubModule.name}
                  </Typography>
                )}
              </Typography>
              <Chip
                label={`${selectedSubModule ? (selectedSubModule.children?.length ?? 0) : getExportCount(selectedModule)} exports`}
                size="small"
                variant="outlined"
              />
            </Box>
            {getCommentText(selectedModule.comment) && !selectedSubModule && (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {getCommentText(selectedModule.comment)}
              </Typography>
            )}
            <ModuleView module={selectedModule} selectedSubModule={selectedSubModule} searchQuery={searchQuery} idIndex={idIndex} />
          </>
        ) : (
          <Typography color="text.secondary">Select a module from the sidebar</Typography>
        )}
      </Box>
    </Box>
  );
}
