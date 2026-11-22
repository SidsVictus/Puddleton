// Stand-in for three.js on the server. cosmetics.mjs builds a few materials when it loads; the server only
// reads its catalogs (cleanLook, RACKS, EMOTES), so these do nothing. Every name cosmetics.mjs uses is listed.
class Stub {}
export const Box3 = Stub, BoxGeometry = Stub, Color = Stub, ConeGeometry = Stub, CylinderGeometry = Stub, DataTexture = Stub;
export const DirectionalLight = Stub, Float32BufferAttribute = Stub, Group = Stub, HemisphereLight = Stub, Mesh = Stub;
export const MeshBasicMaterial = Stub, MeshToonMaterial = Stub, OrthographicCamera = Stub, Scene = Stub, Shape = Stub;
export const ShapeGeometry = Stub, SphereGeometry = Stub, TorusGeometry = Stub, Vector3 = Stub, WebGLRenderer = Stub;
export const RedFormat = 0, NearestFilter = 0, DoubleSide = 0;
export const PlaneGeometry = Stub, WebGLRenderTarget = Stub, NoBlending = 0, SRGBColorSpace = "srgb";
