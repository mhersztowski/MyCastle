#!/usr/bin/env bash
# Pobiera ikony z repo FreeCAD do public/icons/freecad/
# Licencja: LGPL 2.0+ (patrz LICENSE.txt w katalogu docelowym)

set -e

OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/src/assets/freecad-icons"
mkdir -p "$OUT_DIR"

# FreeCAD ma ikony rozproszone po różnych modułach — sprawdzamy wszystkie.
BASES=(
  "https://raw.githubusercontent.com/FreeCAD/FreeCAD/main/src/Mod/PartDesign/Gui/Resources/icons"
  "https://raw.githubusercontent.com/FreeCAD/FreeCAD/main/src/Mod/Sketcher/Gui/Resources/icons"
  "https://raw.githubusercontent.com/FreeCAD/FreeCAD/main/src/Mod/Sketcher/Gui/Resources/icons/geometry"
  "https://raw.githubusercontent.com/FreeCAD/FreeCAD/main/src/Mod/Sketcher/Gui/Resources/icons/constraints"
  "https://raw.githubusercontent.com/FreeCAD/FreeCAD/main/src/Mod/Sketcher/Gui/Resources/icons/tools"
  "https://raw.githubusercontent.com/FreeCAD/FreeCAD/main/src/Mod/Part/Gui/Resources/icons"
  "https://raw.githubusercontent.com/FreeCAD/FreeCAD/main/src/Mod/Draft/Resources/icons"
)

# Dla każdego aliasu — lista możliwych nazw SVG w FreeCAD.
# Skrypt próbuje wszystkie base × wszystkie candidates, bierze pierwsze 200 OK.
declare -a ENTRIES=(
  # alias | candidates
  "extrude|PartDesign_AdditivePad.svg,PartDesign_Additive_Pad.svg,PartDesign_Pad.svg"
  "loft|PartDesign_AdditiveLoft.svg,PartDesign_Additive_Loft.svg,PartDesign_Loft.svg,Part_Loft.svg"
  "sweep|PartDesign_AdditivePipe.svg,PartDesign_Additive_Pipe.svg,PartDesign_Pipe.svg,Part_Sweep.svg"
  "helix|PartDesign_AdditiveHelix.svg,PartDesign_Additive_Helix.svg,PartDesign_Helix.svg"
  "revolve|PartDesign_Revolution.svg,Part_Revolve.svg"
  "pocket|PartDesign_Pocket.svg,PartDesign_SubtractivePad.svg"
  "loft_cut|PartDesign_SubtractiveLoft.svg,PartDesign_Subtractive_Loft.svg"
  "sweep_cut|PartDesign_SubtractivePipe.svg,PartDesign_Subtractive_Pipe.svg"
  "groove|PartDesign_Groove.svg"
  "hole|PartDesign_Hole.svg"
  "mirror|PartDesign_Mirrored.svg,PartDesign_Mirror.svg,Draft_Mirror.svg"
  "shell|PartDesign_Thickness.svg,PartDesign_Shell.svg,Part_Thickness.svg"
  "fillet|PartDesign_Fillet.svg,Part_Fillet.svg"
  "chamfer|PartDesign_Chamfer.svg,Part_Chamfer.svg"
  "draft|PartDesign_Draft.svg"
  "linear_pattern|PartDesign_LinearPattern.svg,PartDesign_Linear_Pattern.svg"
  "polar_pattern|PartDesign_PolarPattern.svg,PartDesign_Polar_Pattern.svg"
  "datum_point|PartDesign_Point.svg,Draft_Point.svg,Sketcher_CreatePoint.svg"
  "datum_line|PartDesign_Line.svg,Draft_Line.svg,Sketcher_CreateLine.svg"
  "datum_plane|PartDesign_Plane.svg,Draft_Plane.svg"
  "datum_cs|PartDesign_CoordinateSystem.svg,PartDesign_LocalCoordinateSystem.svg,Draft_WorkingPlaneProxy.svg"
  "sketch|Sketcher_NewSketch.svg,PartDesign_NewSketch.svg,Sketcher_Sketch.svg,Draft_Sketch.svg"

  # ── Narzędzia 2D Sketchera (Toolbar edytora szkicu) ──────────────────────────
  "line|Sketcher_CreateLine.svg"
  "point|Sketcher_CreatePoint.svg"
  "circle|Sketcher_CreateCircle.svg"
  "circle_3p|Sketcher_Create3PointCircle.svg,Sketcher_CreateCircle_3points.svg"
  "arc|Sketcher_CreateArc.svg"
  "arc_3p|Sketcher_Create3PointArc.svg,Sketcher_CreateArc_3points.svg"
  "rect|Sketcher_CreateRectangle.svg"
  "rect_center|Sketcher_CreateRectangle_Center.svg,Sketcher_CreateRectangleCenter.svg,Sketcher_CreateCenteredRectangle.svg"
  "polyline|Sketcher_CreatePolyline.svg"
  "polygon_triangle|Sketcher_CreateTriangle.svg"
  "polygon_square|Sketcher_CreateSquare.svg"
  "polygon_pentagon|Sketcher_CreatePentagon.svg"
  "polygon_hexagon|Sketcher_CreateHexagon.svg"
  "polygon_heptagon|Sketcher_CreateHeptagon.svg"
  "polygon_octagon|Sketcher_CreateOctagon.svg"
  "polygon_regular|Sketcher_CreateRegularPolygon.svg"
  "slot|Sketcher_CreateSlot.svg"
  "arc_slot|Sketcher_CreateArcSlot.svg"
  "bspline|Sketcher_CreateBSpline.svg"
  "bspline_periodic|Sketcher_Create_Periodic_BSpline.svg,Sketcher_CreatePeriodicBSpline.svg"
  "bspline_knots|Sketcher_CreateBSplineByInterpolation.svg"
  "bspline_knots_periodic|Sketcher_CreatePeriodicBSplineByInterpolation.svg"

  # ── Ikony constraintów (panel + toolbar) ─────────────────────────────────────
  "c_dimension|Constraint_Dimension.svg"
  "c_coincident|Constraint_Coincident.svg,Constraint_PointOnPoint.svg"
  "c_horizontal|Constraint_Horizontal.svg"
  "c_vertical|Constraint_Vertical.svg"
  "c_parallel|Constraint_Parallel.svg"
  "c_perpendicular|Constraint_Perpendicular.svg"
  "c_equal|Constraint_EqualLength.svg"
  "c_symmetric|Constraint_Symmetric.svg"
  "c_tangent|Constraint_Tangent.svg"
  "c_distance|Constraint_Length.svg"
  "c_horizontal_distance|Constraint_HorizontalDistance.svg"
  "c_vertical_distance|Constraint_VerticalDistance.svg"
  "c_radius|Constraint_Radius.svg"
  "c_diameter|Constraint_Diameter.svg"
  "c_angle|Constraint_InternalAngle.svg"
  "c_fixed|Constraint_Lock.svg,Constraint_Block.svg"
)

ok=0
fail=0
for entry in "${ENTRIES[@]}"; do
  ALIAS="${entry%%|*}"
  CANDIDATES="${entry##*|}"

  found=""
  IFS=',' read -ra NAMES <<< "$CANDIDATES"

  # Próbuj każdy candidate name × każdy base URL
  for NAME in "${NAMES[@]}"; do
    for BASE in "${BASES[@]}"; do
      code=$(curl -fsSL -o /dev/null -w "%{http_code}" "${BASE}/${NAME}" 2>/dev/null || echo "000")
      if [[ "$code" == "200" ]]; then
        found="${BASE}/${NAME}"
        break 2
      fi
    done
  done

  if [[ -n "$found" ]]; then
    curl -fsSL "$found" -o "${OUT_DIR}/${ALIAS}.svg"
    # Skróć URL do samej nazwy dla logu
    echo "  ✓ ${ALIAS}.svg  ←  ${found##*/}"
    ok=$((ok+1))
  else
    echo "  ✗ ${ALIAS} — nie znaleziono w żadnym z ${#BASES[@]} katalogów FreeCAD"
    fail=$((fail+1))
  fi
done

# Zapisz notę o licencji
cat > "${OUT_DIR}/LICENSE.txt" <<EOF
Ikony w tym katalogu pochodzą z projektu FreeCAD (https://www.freecad.org).
Licencja: LGPL 2.0+
Katalogi źródłowe:
  - src/Mod/PartDesign/Gui/Resources/icons
  - src/Mod/Sketcher/Gui/Resources/icons
  - src/Mod/Part/Gui/Resources/icons
  - src/Mod/Draft/Resources/icons

Copyright © FreeCAD contributors.
EOF

echo ""
echo "Gotowe. Sukces: ${ok}, brak: ${fail}."
echo "Katalog: ${OUT_DIR}"
if [[ ${fail} -gt 0 ]]; then
  echo ""
  echo "Ikony których brak — sprawdź nazwy w GitHub search:"
  echo "  https://github.com/FreeCAD/FreeCAD/tree/main/src/Mod"
fi
