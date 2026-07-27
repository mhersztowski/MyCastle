--[[
  Filtr Rysika — router AST, nic więcej.

  Zadanie filtra kończy się na rozpoznaniu bloku kodu z naszą klasą i wypuszczeniu
  albo punktu montowania (HTML), albo figury ze zrzutem (PDF/DOCX). YAML z ciała
  bloku NIE jest tu parsowany — leci w niezmienionej postaci do runtime'u JS albo
  do generatora snapshotów. Im mniej logiki w Lua, tym mniej implementacji tego
  samego trzeba utrzymywać.

  Numerację, podpisy i odsyłacze (@fig-...) robi Quarto — dlatego zwracamy Div
  z identyfikatorem `fig-*` i podpisem w ostatnim akapicie.
]]

local BLOCK_CLASSES = {
  ['scene3d-terrain'] = 'scene3d.terrain',
  ['chart-bars'] = 'chart.bars',
}

local VARS_CLASS = 'rysik-vars'

-- Zasoby dokładamy raz na dokument i tylko wtedy, gdy naprawdę jest co montować.
local resources_added = false

local function add_resources()
  if resources_added or not quarto.doc.is_format('html:js') then return end
  resources_added = true
  quarto.doc.add_html_dependency({
    name = 'rysik',
    version = '1.0.0',
    scripts = { 'resources/rysik-runtime.js' },
    stylesheets = { 'resources/rysik.css' },
  })
end

local function block_type(el)
  for _, cls in ipairs(el.classes) do
    if BLOCK_CLASSES[cls] then return BLOCK_CLASSES[cls] end
  end
  return nil
end

local function has_class(el, name)
  for _, cls in ipairs(el.classes) do
    if cls == name then return true end
  end
  return false
end

local function escape_html(s)
  return s:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;')
end

--- Ścieżka zrzutu wygenerowanego przez pre-render (`scripts/render-scenes.mjs`).
local function snapshot_path(id)
  return '_scenes/' .. (id ~= '' and id or 'blok') .. '.png'
end

local function caption_blocks(el)
  local cap = el.attributes['fig-cap']
  if cap == nil or cap == '' then return nil end
  return pandoc.Para(pandoc.read(cap, 'markdown').blocks[1].content)
end

--- Punkt montowania dla runtime'u JS. Payload zostaje tekstem — bez base64,
--- żeby źródło strony dało się przeczytać i zdiagnozować.
local function interactive_mount(btype, payload, id)
  local html = table.concat({
    '<div class="rysik-mount" data-type="', btype, '" data-id="', id, '">',
    '<script type="application/x-rysik">', escape_html(payload), '</script>',
    '</div>',
  })
  return pandoc.RawBlock('html', html)
end

function CodeBlock(el)
  -- Panel zmiennych: w HTML staje się zestawem suwaków, w formatach statycznych
  -- znika (nie ma czym sterować, wartości są wtedy kanoniczne).
  if has_class(el, VARS_CLASS) then
    if quarto.doc.is_format('html:js') then
      add_resources()
      return pandoc.RawBlock('html', table.concat({
        '<div class="rysik-vars">',
        '<script type="application/x-rysik-vars">', escape_html(el.text), '</script>',
        '</div>',
      }))
    end
    return {}
  end

  local btype = block_type(el)
  if not btype then return nil end

  local id = el.identifier
  if id == '' then id = el.attributes['label'] or '' end

  local content
  if quarto.doc.is_format('html:js') then
    add_resources()
    content = interactive_mount(btype, el.text, id)
  else
    content = pandoc.Para({ pandoc.Image({}, snapshot_path(id)) })
  end

  local blocks = { content }
  local cap = caption_blocks(el)
  if cap then table.insert(blocks, cap) end

  -- Div z identyfikatorem `fig-*` i podpisem na końcu — Quarto numeruje go
  -- jak zwykły rysunek, więc @fig-... działa bez naszego udziału.
  return pandoc.Div(blocks, pandoc.Attr(id, { 'rysik-figure' }, {}))
end
