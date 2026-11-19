// Rig template shared by every character. Every part PNG must match these
// sizes and pivots; the Rig Lab templates are generated from this file.
//
// View: 3/4, body turned toward the opponent (screen right), face looking
// right. "F" limbs are the near side (screen left, drawn in front); "B" limbs
// are the far side (screen right, drawn behind and slightly darker).
window.FC = window.FC || {};

// Rig units -> game pixels at 1280x720. Players end up ~135 px tall.
FC.ART_SCALE = 0.32;

// size: PNG size. pivot: the joint the part rotates around. joints: where
// child parts attach. All coordinates are pixels inside the PNG.
FC.PARTS = {
  head:     { size: [200, 200], pivot: [96, 192], joints: { eyes: [118, 112], mouth: [124, 160] } },
  torso:    { size: [120, 112], pivot: [60, 102], joints: { neck: [62, 12], shoulderF: [26, 28], shoulderB: [90, 26] } },
  upperArm: { size: [40, 64],   pivot: [20, 12],  joints: { elbow: [20, 52] } },
  forearm:  { size: [40, 68],   pivot: [20, 10],  joints: {} },
  thigh:    { size: [52, 80],   pivot: [26, 12],  joints: { knee: [26, 68] } },
  shin:     { size: [40, 76],   pivot: [20, 10],  joints: { ankle: [20, 66] } },
  boot:     { size: [64, 38],   pivot: [22, 12],  joints: {} },
};

// Face pieces are swapped on the head to change expression.
FC.FACE = {
  eyes:  { size: [120, 56], pivot: [60, 28], joints: {}, variants: ['open', 'closed', 'angry', 'happy', 'sad', 'dizzy', 'shock'] },
  mouth: { size: [64, 36],  pivot: [32, 18], joints: {}, variants: ['neutral', 'smile', 'shout', 'grit', 'sad', 'tongue'] },
};

(function () {
  const P = FC.PARTS;
  const joint = (part, name) => [
    P[part].joints[name][0] - P[part].pivot[0],
    P[part].joints[name][1] - P[part].pivot[1],
  ];
  const elbow = joint('upperArm', 'elbow');
  const knee = joint('thigh', 'knee');
  const ankle = joint('shin', 'ankle');

  FC.LEG = { thigh: knee[1], shin: ankle[1], ankleHeight: P.boot.size[1] - P.boot.pivot[1] };
  FC.HIP_HEIGHT = FC.LEG.thigh + FC.LEG.shin + FC.LEG.ankleHeight;
  // Ankle height when the boot is flat on the ground; leg IK targets use it.
  FC.ANKLE_Y = -FC.LEG.ankleHeight;

  // Parents come before children.
  FC.SKELETON = [
    { name: 'root' },
    { name: 'hip', parent: 'root', at: [0, -FC.HIP_HEIGHT] },
    { name: 'torso', parent: 'hip', part: 'torso' },
    { name: 'head', parent: 'torso', part: 'head', at: joint('torso', 'neck') },
    { name: 'eyes', parent: 'head', slot: 'eyes', at: joint('head', 'eyes') },
    { name: 'mouth', parent: 'head', slot: 'mouth', at: joint('head', 'mouth') },
    { name: 'armB', parent: 'torso', part: 'upperArm', at: joint('torso', 'shoulderB'), back: true },
    { name: 'foreB', parent: 'armB', part: 'forearm', at: elbow, back: true },
    { name: 'armF', parent: 'torso', part: 'upperArm', at: joint('torso', 'shoulderF') },
    { name: 'foreF', parent: 'armF', part: 'forearm', at: elbow },
    { name: 'thighB', parent: 'hip', part: 'thigh', at: [16, 0], back: true },
    { name: 'shinB', parent: 'thighB', part: 'shin', at: knee, back: true },
    { name: 'bootB', parent: 'shinB', part: 'boot', at: ankle, back: true },
    { name: 'thighF', parent: 'hip', part: 'thigh', at: [-16, 0] },
    { name: 'shinF', parent: 'thighF', part: 'shin', at: knee },
    { name: 'bootF', parent: 'shinF', part: 'boot', at: ankle },
  ];

  FC.DRAW_ORDER = [
    'armB', 'foreB',
    'thighB', 'shinB', 'bootB',
    'thighF', 'shinF', 'bootF',
    'torso', 'head', 'eyes', 'mouth',
    'armF', 'foreF',
  ];
})();
