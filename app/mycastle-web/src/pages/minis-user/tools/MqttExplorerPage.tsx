import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Select, MenuItem, Switch,
  FormControlLabel, Chip, Divider, FormControl, InputLabel, List,
  ListItemButton, ListItemText, Collapse, IconButton, Tooltip,
  Autocomplete,
} from '@mui/material';
import {
  ExpandMore, ChevronRight, Send as PublishIcon, DeleteSweep as ClearIcon,
  ContentCopy as CopyIcon, CallMade as CopyToPublishIcon, AccountTree as NodeRedIcon,
} from '@mui/icons-material';
import mqtt from 'mqtt';
import { getMqttUrl } from '@mhersztowski/web-client';
import { matchTopic, mqttTopics } from '@mhersztowski/core';
import type { MqttTopicDef } from '@mhersztowski/core';
import { useAuth } from '@modules/auth';

// --- Types ---

interface TopicNode {
  segment: string;
  fullTopic: string;
  lastPayload?: string;
  lastTimestamp?: number;
  qos?: number;
  retained?: boolean;
  messageCount: number;
  children: Map<string, TopicNode>;
}

// --- Helpers ---

function createRootNode(): TopicNode {
  return { segment: '', fullTopic: '', messageCount: 0, children: new Map() };
}

function formatPayload(payload?: string): string {
  if (!payload) return '(empty)';
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function validatePayload(fullTopic: string, payload?: string): { matched: boolean; name?: string; description?: string; direction?: string; tags?: string[]; valid?: boolean; error?: string; params?: Record<string, string> } {
  const match = matchTopic(fullTopic);
  if (!match) return { matched: false };
  if (!payload) return { matched: true, name: match.name, description: match.def.description, direction: match.def.direction, tags: match.def.tags, params: match.params };
  try {
    const parsed = JSON.parse(payload);
    const result = match.def.payloadSchema.safeParse(parsed);
    return { matched: true, name: match.name, description: match.def.description, direction: match.def.direction, tags: match.def.tags, valid: result.success, error: result.success ? undefined : result.error.issues.map((i: { message: string }) => i.message).join(', '), params: match.params };
  } catch {
    return { matched: true, name: match.name, description: match.def.description, direction: match.def.direction, tags: match.def.tags, valid: false, error: 'Invalid JSON', params: match.params };
  }
}

const MAX_TOPICS = 10_000;

// --- Node-RED flow export helpers ---

interface NodeRedTarget {
  label: string;
  brokerUrl: string;
  mqttPort: string;
  tls: boolean;
}

const nodeRedTargets: NodeRedTarget[] = [
  { label: 'NR Local', brokerUrl: 'ws://172.17.0.1:1902/mqtt', mqttPort: '1902', tls: false },
  { label: 'NR Remote', brokerUrl: 'wss://minis.hersztowski.org/mqtt', mqttPort: '443', tls: true },
];

function nodeRedId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function buildNodeRedMqttSubscribe(topic: string, target: NodeRedTarget, credentials?: { user: string; password: string }): string {
  const brokerId = nodeRedId();
  const mqttInId = nodeRedId();
  const debugId = nodeRedId();
  return JSON.stringify([
    {
      id: brokerId, type: 'mqtt-broker', name: `Minis (${target.label})`,
      broker: target.brokerUrl, port: target.mqttPort,
      clientid: '', autoConnect: true, usetls: target.tls,
      protocolVersion: '4', keepalive: '60', cleansession: true,
      autoUnsubscribe: true, birthTopic: '', closeTopic: '', willTopic: '',
      birthQos: '0', closeQos: '0', willQos: '0',
      birthPayload: '', closePayload: '', willPayload: '',
      birthMsg: {}, closeMsg: {}, willMsg: {},
      birthRetain: false, closeRetain: false, willRetain: false,
      sessionExpiry: '',
      ...(credentials ? { credentials: { user: credentials.user, password: credentials.password } } : {}),
    },
    {
      id: mqttInId, type: 'mqtt in', name: topic.split('/').pop() || topic,
      topic, qos: '0', datatype: 'json', broker: brokerId,
      nl: false, rap: true, rh: 0, inputs: 0,
      x: 200, y: 200, wires: [[debugId]],
    },
    {
      id: debugId, type: 'debug', name: '', active: true,
      tosidebar: true, console: false, tostatus: false,
      complete: 'payload', targetType: 'msg',
      x: 450, y: 200, wires: [],
    },
  ]);
}

function buildNodeRedMqttPublish(topic: string, target: NodeRedTarget, payload?: string, credentials?: { user: string; password: string }): string {
  const brokerId = nodeRedId();
  const injectId = nodeRedId();
  const mqttOutId = nodeRedId();
  return JSON.stringify([
    {
      id: brokerId, type: 'mqtt-broker', name: `Minis (${target.label})`,
      broker: target.brokerUrl, port: target.mqttPort,
      clientid: '', autoConnect: true, usetls: target.tls,
      protocolVersion: '4', keepalive: '60', cleansession: true,
      autoUnsubscribe: true, birthTopic: '', closeTopic: '', willTopic: '',
      birthQos: '0', closeQos: '0', willQos: '0',
      birthPayload: '', closePayload: '', willPayload: '',
      birthMsg: {}, closeMsg: {}, willMsg: {},
      birthRetain: false, closeRetain: false, willRetain: false,
      sessionExpiry: '',
      ...(credentials ? { credentials: { user: credentials.user, password: credentials.password } } : {}),
    },
    {
      id: injectId, type: 'inject', name: 'Trigger',
      props: [{ p: 'payload', v: payload || '{}', vt: 'json' }],
      repeat: '', crontab: '', once: false, onceDelay: 0.1, topic: '',
      x: 200, y: 200, wires: [[mqttOutId]],
    },
    {
      id: mqttOutId, type: 'mqtt out', name: topic.split('/').pop() || topic,
      topic, qos: '0', retain: '', respTopic: '', contentType: '',
      broker: brokerId, x: 450, y: 200, wires: [],
    },
  ]);
}

// --- Topic suggestions for Publish autocomplete ---

interface TopicSuggestion {
  pattern: string;
  description: string;
  direction: string;
  name: string;
}

const topicSuggestions: TopicSuggestion[] = Object.entries(mqttTopics).map(
  ([name, def]: [string, MqttTopicDef]) => ({
    name,
    pattern: def.pattern,
    description: def.description,
    direction: def.direction,
  }),
);

// --- TopicTreeNode ---

function TopicTreeNode({ node, level, selectedFullTopic, expandedPaths, onSelect, onToggle, filter }: {
  node: TopicNode;
  level: number;
  selectedFullTopic: string | null;
  expandedPaths: Set<string>;
  onSelect: (node: TopicNode) => void;
  onToggle: (path: string) => void;
  filter: string;
}) {
  const hasChildren = node.children.size > 0;
  const isExpanded = expandedPaths.has(node.fullTopic);
  const isSelected = selectedFullTopic === node.fullTopic;

  const sortedChildren = [...node.children.values()].sort((a, b) => a.segment.localeCompare(b.segment));

  const matchesFilter = !filter || node.fullTopic.toLowerCase().includes(filter.toLowerCase());
  const hasMatchingDescendant = !filter || matchesFilter || sortedChildren.some(
    (child) => child.fullTopic.toLowerCase().includes(filter.toLowerCase()) || hasDescendantMatch(child, filter),
  );

  if (filter && !matchesFilter && !hasMatchingDescendant) return null;

  return (
    <>
      <ListItemButton
        sx={{ pl: 1 + level * 2, py: 0.25 }}
        selected={isSelected}
        onClick={() => {
          onSelect(node);
          if (hasChildren) onToggle(node.fullTopic);
        }}
        dense
      >
        {hasChildren ? (
          isExpanded ? <ExpandMore sx={{ fontSize: 18, mr: 0.5 }} /> : <ChevronRight sx={{ fontSize: 18, mr: 0.5 }} />
        ) : (
          <Box sx={{ width: 22, mr: 0.5 }} />
        )}
        <ListItemText
          primary={node.segment}
          primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace', fontSize: 13 }}
          secondary={node.lastPayload != null ? truncate(node.lastPayload, 40) : undefined}
          secondaryTypographyProps={{ variant: 'caption', fontFamily: 'monospace', fontSize: 11, noWrap: true }}
        />
        {node.messageCount > 0 && (
          <Chip label={node.messageCount} size="small" sx={{ ml: 0.5, height: 18, fontSize: 11, '& .MuiChip-label': { px: 0.75 } }} />
        )}
      </ListItemButton>
      {hasChildren && isExpanded && (
        <Collapse in timeout="auto" unmountOnExit>
          {sortedChildren.map((child) => (
            <TopicTreeNode
              key={child.segment}
              node={child}
              level={level + 1}
              selectedFullTopic={selectedFullTopic}
              expandedPaths={expandedPaths}
              onSelect={onSelect}
              onToggle={onToggle}
              filter={filter}
            />
          ))}
        </Collapse>
      )}
    </>
  );
}

function hasDescendantMatch(node: TopicNode, filter: string): boolean {
  const lowerFilter = filter.toLowerCase();
  for (const child of node.children.values()) {
    if (child.fullTopic.toLowerCase().includes(lowerFilter)) return true;
    if (hasDescendantMatch(child, filter)) return true;
  }
  return false;
}

// --- TopicDetail ---

function TopicDetail({ node, onCopyToPublish, mqttCredentials }: { node: TopicNode; onCopyToPublish: (topic: string, payload?: string) => void; mqttCredentials?: { user: string; password: string } }) {
  const typeInfo = validatePayload(node.fullTopic, node.lastPayload);

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Topic</Typography>
      <Typography variant="body2" fontFamily="monospace" sx={{ mb: 1, wordBreak: 'break-all' }}>
        {node.fullTopic}
      </Typography>

      {/* Type info from registry */}
      {typeInfo.matched && (
        <Box sx={{ mb: 1, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip label={typeInfo.name} size="small" color="primary" variant="outlined" />
          <Chip label={typeInfo.direction} size="small" variant="outlined" />
          {typeInfo.tags?.map((tag) => <Chip key={tag} label={tag} size="small" variant="outlined" />)}
          {typeInfo.valid !== undefined && (
            <Chip
              label={typeInfo.valid ? 'Valid' : 'Invalid'}
              size="small"
              color={typeInfo.valid ? 'success' : 'error'}
            />
          )}
        </Box>
      )}
      {typeInfo.matched && typeInfo.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{typeInfo.description}</Typography>
      )}
      {typeInfo.matched && typeInfo.params && Object.keys(typeInfo.params).length > 0 && (
        <Box sx={{ mb: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {Object.entries(typeInfo.params).map(([k, v]) => (
            <Chip key={k} label={`${k}: ${v}`} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: 11 }} />
          ))}
        </Box>
      )}
      {typeInfo.error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>{typeInfo.error}</Typography>
      )}

      <Divider sx={{ my: 1 }} />
      <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip label={`QoS ${node.qos ?? '-'}`} size="small" />
        {node.retained && <Chip label="Retained" size="small" color="info" />}
        <Chip label={`${node.messageCount} msgs`} size="small" />
        {node.lastTimestamp && (
          <Typography variant="caption" color="text.secondary">
            {new Date(node.lastTimestamp).toLocaleTimeString()}
          </Typography>
        )}
      </Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Payload</Typography>
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50', maxHeight: 300, overflow: 'auto' }}>
        <Box component="pre" sx={{ m: 0, fontSize: 13, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {formatPayload(node.lastPayload)}
        </Box>
      </Paper>
      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
        <Button
          size="small"
          startIcon={<CopyIcon fontSize="small" />}
          onClick={() => navigator.clipboard.writeText(node.fullTopic)}
        >
          Copy Topic
        </Button>
        <Button
          size="small"
          startIcon={<CopyToPublishIcon fontSize="small" />}
          onClick={() => onCopyToPublish(node.fullTopic, node.lastPayload)}
        >
          Copy to Publish
        </Button>
        {nodeRedTargets.map((t) => (
          <Button
            key={t.label}
            size="small"
            startIcon={<NodeRedIcon fontSize="small" />}
            onClick={() => navigator.clipboard.writeText(buildNodeRedMqttSubscribe(node.fullTopic, t, mqttCredentials))}
          >
            {t.label}
          </Button>
        ))}
      </Box>
    </Paper>
  );
}

// --- Main Page ---

function MqttExplorerPage() {
  const { currentUser, token } = useAuth();
  const clientRef = useRef<ReturnType<typeof mqtt.connect> | null>(null);
  const treeRef = useRef<TopicNode>(createRootNode());
  const messageCountRef = useRef(0);
  const topicCountRef = useRef(0);
  const updateScheduledRef = useRef(false);
  const activeSubsRef = useRef<string[]>([]);

  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [treeVersion, setTreeVersion] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState<TopicNode | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [subscribePattern, setSubscribePattern] = useState('#');
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([]);
  const [publishTopic, setPublishTopic] = useState('');
  const [publishPayload, setPublishPayload] = useState('');
  const [publishQos, setPublishQos] = useState<0 | 1 | 2>(0);
  const [publishRetain, setPublishRetain] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);
  const [totalTopics, setTotalTopics] = useState(0);
  const [searchFilter, setSearchFilter] = useState('');
  const [apiKeyOverride, setApiKeyOverride] = useState(() => localStorage.getItem('minis_nr_apikey') || '');

  const scheduleUpdate = useCallback(() => {
    if (updateScheduledRef.current) return;
    updateScheduledRef.current = true;
    requestAnimationFrame(() => {
      setTreeVersion((v) => v + 1);
      setTotalMessages(messageCountRef.current);
      setTotalTopics(topicCountRef.current);
      updateScheduledRef.current = false;
    });
  }, []);

  const handleMessage = useCallback((topic: string, payload: Buffer, packet: { qos: number; retain: boolean }) => {
    const segments = topic.split('/');
    let current = treeRef.current;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!current.children.has(seg)) {
        if (topicCountRef.current >= MAX_TOPICS) break;
        current.children.set(seg, {
          segment: seg,
          fullTopic: segments.slice(0, i + 1).join('/'),
          messageCount: 0,
          children: new Map(),
        });
        topicCountRef.current++;
      }
      current = current.children.get(seg)!;
    }

    const payloadStr = payload.toString();
    current.lastPayload = payloadStr;
    current.lastTimestamp = Date.now();
    current.qos = packet.qos;
    current.retained = packet.retain;
    current.messageCount++;
    messageCountRef.current++;

    scheduleUpdate();
  }, [scheduleUpdate]);

  // MQTT connection lifecycle
  useEffect(() => {
    setConnectionStatus('connecting');
    const url = getMqttUrl();
    const client = mqtt.connect(url, {
      clientId: `minis_explorer_${Date.now()}`,
      protocolVersion: 4,
      ...(currentUser && token ? { username: currentUser.name, password: token } : {}),
    });
    clientRef.current = client;

    client.on('connect', () => {
      setConnectionStatus('connected');
      client.subscribe('#', { qos: 0 });
      setActiveSubscriptions(['#']);
      activeSubsRef.current = ['#'];
    });

    client.on('message', handleMessage as any);
    client.on('error', () => setConnectionStatus('error'));
    client.on('close', () => setConnectionStatus('disconnected'));
    client.on('reconnect', () => {
      setConnectionStatus('connecting');
      // Resubscribe on reconnect
      for (const sub of activeSubsRef.current) {
        client.subscribe(sub, { qos: 0 });
      }
    });

    return () => {
      client.end(true);
      clientRef.current = null;
    };
  }, [handleMessage]);

  const handleSubscribe = useCallback(() => {
    const client = clientRef.current;
    const pattern = subscribePattern.trim();
    if (!client?.connected || !pattern) return;
    client.subscribe(pattern, { qos: 0 });
    setActiveSubscriptions((prev) => {
      const next = [...new Set([...prev, pattern])];
      activeSubsRef.current = next;
      return next;
    });
  }, [subscribePattern]);

  const handleUnsubscribe = useCallback((pattern: string) => {
    clientRef.current?.unsubscribe(pattern);
    setActiveSubscriptions((prev) => {
      const next = prev.filter((p) => p !== pattern);
      activeSubsRef.current = next;
      return next;
    });
  }, []);

  const handlePublish = useCallback(() => {
    const client = clientRef.current;
    if (!client?.connected || !publishTopic.trim()) return;
    client.publish(publishTopic.trim(), publishPayload, {
      qos: publishQos,
      retain: publishRetain,
    });
  }, [publishTopic, publishPayload, publishQos, publishRetain]);

  const handleClear = useCallback(() => {
    treeRef.current = createRootNode();
    messageCountRef.current = 0;
    topicCountRef.current = 0;
    setTreeVersion((v) => v + 1);
    setTotalMessages(0);
    setTotalTopics(0);
    setSelectedTopic(null);
    setExpandedPaths(new Set());
  }, []);

  const handleSelectNode = useCallback((node: TopicNode) => {
    setSelectedTopic(node);
  }, []);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const mqttCredentials = useMemo(() => {
    if (apiKeyOverride) return { user: currentUser?.name ?? '', password: apiKeyOverride };
    if (currentUser && token) return { user: currentUser.name, password: token };
    return undefined;
  }, [apiKeyOverride, currentUser, token]);

  const statusColor = connectionStatus === 'connected' ? 'success.main'
    : connectionStatus === 'connecting' ? 'warning.main'
    : connectionStatus === 'error' ? 'error.main'
    : 'grey.500';

  // Re-resolve selected topic from tree ref on each render (it may have been mutated)
  const resolvedSelected = selectedTopic ? resolveNode(treeRef.current, selectedTopic.fullTopic) : null;

  // Force read treeVersion to trigger re-render
  void treeVersion;

  const rootChildren = [...treeRef.current.children.values()].sort((a, b) => a.segment.localeCompare(b.segment));

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>MQTT Explorer</Typography>

      {/* Connection bar */}
      <Paper sx={{ p: 1.5, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: statusColor, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ mr: 1 }}>{connectionStatus}</Typography>
        <Chip label={`${totalMessages} msgs`} size="small" variant="outlined" />
        <Chip label={`${totalTopics} topics`} size="small" variant="outlined" />
        {totalTopics >= MAX_TOPICS && <Chip label="topic limit reached" size="small" color="warning" />}
        <Box sx={{ flexGrow: 1 }} />
        <TextField
          size="small"
          value={subscribePattern}
          onChange={(e) => setSubscribePattern(e.target.value)}
          placeholder="Subscribe pattern"
          sx={{ width: 180 }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubscribe(); }}
        />
        <Button size="small" variant="outlined" onClick={handleSubscribe} disabled={connectionStatus !== 'connected'}>
          Subscribe
        </Button>
        <Tooltip title="Clear all topics">
          <IconButton size="small" onClick={handleClear} color="error">
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Paper>

      {/* Active subscriptions */}
      {activeSubscriptions.length > 0 && (
        <Box sx={{ mb: 1.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {activeSubscriptions.map((sub) => (
            <Chip key={sub} label={sub} size="small" onDelete={() => handleUnsubscribe(sub)} variant="outlined" />
          ))}
        </Box>
      )}

      {/* Main layout: tree + detail */}
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        {/* Topic tree */}
        <Paper sx={{ width: { md: 350 }, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: { md: '70vh' } }}>
          <TextField
            size="small"
            placeholder="Filter topics..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            sx={{ m: 1 }}
          />
          <List dense sx={{ overflow: 'auto', flexGrow: 1 }}>
            {rootChildren.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                {connectionStatus === 'connected' ? 'Waiting for messages...' : 'Not connected'}
              </Typography>
            ) : (
              rootChildren.map((child) => (
                <TopicTreeNode
                  key={child.segment}
                  node={child}
                  level={0}
                  selectedFullTopic={selectedTopic?.fullTopic ?? null}
                  expandedPaths={expandedPaths}
                  onSelect={handleSelectNode}
                  onToggle={handleToggleExpand}
                  filter={searchFilter}
                />
              ))
            )}
          </List>
        </Paper>

        {/* Right panel */}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {/* Topic detail */}
          {resolvedSelected ? (
            <TopicDetail
              node={resolvedSelected}
              onCopyToPublish={(topic, payload) => { setPublishTopic(topic); if (payload) setPublishPayload(payload); }}
              mqttCredentials={mqttCredentials}
            />
          ) : (
            <Paper sx={{ p: 3, mb: 2, textAlign: 'center' }}>
              <Typography color="text.secondary">Select a topic from the tree to view details</Typography>
            </Paper>
          )}

          {/* Publish */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Publish</Typography>
            <Autocomplete
              freeSolo
              options={topicSuggestions}
              getOptionLabel={(option) => typeof option === 'string' ? option : option.pattern}
              inputValue={publishTopic}
              onInputChange={(_e, value) => setPublishTopic(value)}
              filterOptions={(options, { inputValue }) => {
                const lower = inputValue.toLowerCase();
                return options.filter((o) =>
                  o.pattern.toLowerCase().includes(lower) ||
                  o.name.toLowerCase().includes(lower) ||
                  o.description.toLowerCase().includes(lower),
                );
              }}
              renderOption={(props, option) => (
                <li {...props} key={option.name}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Typography variant="body2" fontFamily="monospace" fontSize={13}>{option.pattern}</Typography>
                      <Chip label={option.direction} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary">{option.description}</Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  fullWidth size="small" sx={{ mb: 1.5 }}
                  label="Topic"
                  placeholder="minis/user1/device1/command"
                />
              )}
            />
            <TextField
              fullWidth size="small" sx={{ mb: 1.5 }}
              label="Payload"
              value={publishPayload}
              onChange={(e) => setPublishPayload(e.target.value)}
              multiline minRows={3} maxRows={8}
              placeholder='{"key": "value"}'
            />
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 80 }}>
                <InputLabel>QoS</InputLabel>
                <Select
                  value={publishQos}
                  label="QoS"
                  onChange={(e) => setPublishQos(e.target.value as unknown as 0 | 1 | 2)}
                >
                  <MenuItem value={0}>0</MenuItem>
                  <MenuItem value={1}>1</MenuItem>
                  <MenuItem value={2}>2</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel
                control={<Switch checked={publishRetain} onChange={(e) => setPublishRetain(e.target.checked)} size="small" />}
                label="Retain"
              />
              <Box sx={{ flexGrow: 1 }} />
              {nodeRedTargets.map((t) => (
                <Button
                  key={t.label}
                  size="small"
                  startIcon={<NodeRedIcon fontSize="small" />}
                  disabled={!publishTopic.trim()}
                  onClick={() => navigator.clipboard.writeText(buildNodeRedMqttPublish(publishTopic.trim(), t, publishPayload || undefined, mqttCredentials))}
                >
                  {t.label}
                </Button>
              ))}
              <Button
                variant="contained"
                onClick={handlePublish}
                disabled={connectionStatus !== 'connected' || !publishTopic.trim()}
                startIcon={<PublishIcon />}
              >
                Publish
              </Button>
            </Box>

            {/* API Key for Node-RED export */}
            <TextField
              size="small"
              label="API Key (for Node-RED export)"
              placeholder="minis_..."
              value={apiKeyOverride}
              onChange={(e) => { setApiKeyOverride(e.target.value); localStorage.setItem('minis_nr_apikey', e.target.value); }}
              sx={{ mt: 2 }}
              fullWidth
              helperText={apiKeyOverride ? 'Node-RED export will use this API key instead of JWT token' : 'Paste an API key for stable Node-RED integrations'}
            />
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}

function resolveNode(root: TopicNode, fullTopic: string): TopicNode | null {
  if (!fullTopic) return null;
  const segments = fullTopic.split('/');
  let current = root;
  for (const seg of segments) {
    const child = current.children.get(seg);
    if (!child) return null;
    current = child;
  }
  return current;
}

export default MqttExplorerPage;
