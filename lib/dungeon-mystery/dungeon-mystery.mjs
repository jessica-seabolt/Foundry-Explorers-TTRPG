// dungeon-mystery 1.1.3 by EpicYoshiMaster (https://github.com/EpicYoshiMaster/dungeon-mystery)
// A port of the Pokemon Mystery Dungeon: Explorers of Sky floor generator. GPL-3.0-or-later; see LICENSE in this folder.
// Unmodified copy of dist/dungeon-mystery.esm.js from the npm package (source map reference removed).

/**
 * NA: 0235171C
 * (X, Y) direction offset pairs
 * This structure is called only for even indices ordinarily, so values are repeated twice
 * for each offset in this version.
 */
var LIST_DIRECTIONS = [
//Down
0, 0, 1, 1,
//Down-Right
1, 1, 1, 1,
//Right
1, 1, 0, 0,
//Up-Right
1, 1, -1, -1,
//Up
0, 0, -1, -1,
//Up-Left
-1, -1, -1, -1,
//Left
-1, -1, 0, 0,
//Down-Left
-1, -1, 1, 1];
/**
 * NA: 02353010
 * Used in GenerateRoomImperfections, table for determining
 * which directions we expect to find open or closed (wall/secondary) tiles in
 *
 * Ex. If generating from the Top-Left corner, we should only expect to find
 * open tiles below us or to our right, otherwise the room will look very strange.
 */
var CORNER_CARDINAL_NEIGHBOR_EXPECT_OPEN = [
//Top-Left Corner
true, false, true, false, false, false, false, false,
//Top-Right Corner
true, false, false, false, false, false, true, false,
//Bottom-Right Corner
false, false, false, false, true, false, true, false,
//Bottom-Left Corner
false, false, true, false, true, false, false, false];
/**
 * NA: 020A1AE8
 * SECONDARY_TERRAIN_TYPES - The type of secondary terrain for each dungeon in the game.
 *
 * 0 = Water
 * 1 = Lava
 * 2 = Chasm
 */
var SECONDARY_TERRAIN_TYPES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 1, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];

//
// Floor Properties
//
var FloorLayout;
(function (FloorLayout) {
  FloorLayout[FloorLayout["LAYOUT_LARGE"] = 0] = "LAYOUT_LARGE";
  FloorLayout[FloorLayout["LAYOUT_SMALL"] = 1] = "LAYOUT_SMALL";
  FloorLayout[FloorLayout["LAYOUT_ONE_ROOM_MONSTER_HOUSE"] = 2] = "LAYOUT_ONE_ROOM_MONSTER_HOUSE";
  FloorLayout[FloorLayout["LAYOUT_OUTER_RING"] = 3] = "LAYOUT_OUTER_RING";
  FloorLayout[FloorLayout["LAYOUT_CROSSROADS"] = 4] = "LAYOUT_CROSSROADS";
  FloorLayout[FloorLayout["LAYOUT_TWO_ROOMS_WITH_MONSTER_HOUSE"] = 5] = "LAYOUT_TWO_ROOMS_WITH_MONSTER_HOUSE";
  FloorLayout[FloorLayout["LAYOUT_LINE"] = 6] = "LAYOUT_LINE";
  FloorLayout[FloorLayout["LAYOUT_CROSS"] = 7] = "LAYOUT_CROSS";
  FloorLayout[FloorLayout["LAYOUT_LARGE_0x8"] = 8] = "LAYOUT_LARGE_0x8";
  FloorLayout[FloorLayout["LAYOUT_BEETLE"] = 9] = "LAYOUT_BEETLE";
  FloorLayout[FloorLayout["LAYOUT_OUTER_ROOMS"] = 10] = "LAYOUT_OUTER_ROOMS";
  FloorLayout[FloorLayout["LAYOUT_MEDIUM"] = 11] = "LAYOUT_MEDIUM";
  FloorLayout[FloorLayout["LAYOUT_UNUSED_0xC"] = 12] = "LAYOUT_UNUSED_0xC";
  FloorLayout[FloorLayout["LAYOUT_UNUSED_0xD"] = 13] = "LAYOUT_UNUSED_0xD";
  FloorLayout[FloorLayout["LAYOUT_UNUSED_0xE"] = 14] = "LAYOUT_UNUSED_0xE";
  FloorLayout[FloorLayout["LAYOUT_UNUSED_0xF"] = 15] = "LAYOUT_UNUSED_0xF";
})(FloorLayout || (FloorLayout = {}));
//
// Dungeon Tile Data
//
var TerrainType;
(function (TerrainType) {
  TerrainType[TerrainType["TERRAIN_WALL"] = 0] = "TERRAIN_WALL";
  TerrainType[TerrainType["TERRAIN_NORMAL"] = 1] = "TERRAIN_NORMAL";
  TerrainType[TerrainType["TERRAIN_SECONDARY"] = 2] = "TERRAIN_SECONDARY";
  TerrainType[TerrainType["TERRAIN_CHASM"] = 3] = "TERRAIN_CHASM";
})(TerrainType || (TerrainType = {}));
var SecondaryTerrainType;
(function (SecondaryTerrainType) {
  SecondaryTerrainType[SecondaryTerrainType["SECONDARY_TERRAIN_WATER"] = 0] = "SECONDARY_TERRAIN_WATER";
  SecondaryTerrainType[SecondaryTerrainType["SECONDARY_TERRAIN_LAVA"] = 1] = "SECONDARY_TERRAIN_LAVA";
  SecondaryTerrainType[SecondaryTerrainType["SECONDARY_TERRAIN_CHASM"] = 2] = "SECONDARY_TERRAIN_CHASM";
})(SecondaryTerrainType || (SecondaryTerrainType = {}));
//
// Dungeon Data
//
// The objective while in a dungeon
var DungeonObjectiveType;
(function (DungeonObjectiveType) {
  DungeonObjectiveType[DungeonObjectiveType["OBJECTIVE_STORY"] = 0] = "OBJECTIVE_STORY";
  DungeonObjectiveType[DungeonObjectiveType["OBJECTIVE_NORMAL"] = 1] = "OBJECTIVE_NORMAL";
  DungeonObjectiveType[DungeonObjectiveType["OBJECTIVE_RESCUE"] = 2] = "OBJECTIVE_RESCUE";
  DungeonObjectiveType[DungeonObjectiveType["OBJECTIVE_UNK_GAMEMODE_5"] = 3] = "OBJECTIVE_UNK_GAMEMODE_5";
})(DungeonObjectiveType || (DungeonObjectiveType = {}));
var MissionType;
(function (MissionType) {
  MissionType[MissionType["MISSION_RESCUE_CLIENT"] = 0] = "MISSION_RESCUE_CLIENT";
  MissionType[MissionType["MISSION_RESCUE_TARGET"] = 1] = "MISSION_RESCUE_TARGET";
  MissionType[MissionType["MISSION_ESCORT_TO_TARGET"] = 2] = "MISSION_ESCORT_TO_TARGET";
  MissionType[MissionType["MISSION_EXPLORE_WITH_CLIENT"] = 3] = "MISSION_EXPLORE_WITH_CLIENT";
  MissionType[MissionType["MISSION_PROSPECT_WITH_CLIENT"] = 4] = "MISSION_PROSPECT_WITH_CLIENT";
  MissionType[MissionType["MISSION_GUIDE_CLIENT"] = 5] = "MISSION_GUIDE_CLIENT";
  MissionType[MissionType["MISSION_FIND_ITEM"] = 6] = "MISSION_FIND_ITEM";
  MissionType[MissionType["MISSION_DELIVER_ITEM"] = 7] = "MISSION_DELIVER_ITEM";
  MissionType[MissionType["MISSION_SEARCH_FOR_TARGET"] = 8] = "MISSION_SEARCH_FOR_TARGET";
  MissionType[MissionType["MISSION_TAKE_ITEM_FROM_OUTLAW"] = 9] = "MISSION_TAKE_ITEM_FROM_OUTLAW";
  MissionType[MissionType["MISSION_ARREST_OUTLAW"] = 10] = "MISSION_ARREST_OUTLAW";
  MissionType[MissionType["MISSION_CHALLENGE_REQUEST"] = 11] = "MISSION_CHALLENGE_REQUEST";
  MissionType[MissionType["MISSION_TREASURE_MEMO"] = 12] = "MISSION_TREASURE_MEMO";
})(MissionType || (MissionType = {}));
var MissionSubtypeChallenge;
(function (MissionSubtypeChallenge) {
  MissionSubtypeChallenge[MissionSubtypeChallenge["MISSION_CHALLENGE_NORMAL"] = 0] = "MISSION_CHALLENGE_NORMAL";
  MissionSubtypeChallenge[MissionSubtypeChallenge["MISSION_CHALLENGE_MEWTWO"] = 1] = "MISSION_CHALLENGE_MEWTWO";
  MissionSubtypeChallenge[MissionSubtypeChallenge["MISSION_CHALLENGE_ENTEI"] = 2] = "MISSION_CHALLENGE_ENTEI";
  MissionSubtypeChallenge[MissionSubtypeChallenge["MISSION_CHALLENGE_RAIKOU"] = 3] = "MISSION_CHALLENGE_RAIKOU";
  MissionSubtypeChallenge[MissionSubtypeChallenge["MISSION_CHALLENGE_SUICUNE"] = 4] = "MISSION_CHALLENGE_SUICUNE";
  MissionSubtypeChallenge[MissionSubtypeChallenge["MISSION_CHALLENGE_JIRACHI"] = 5] = "MISSION_CHALLENGE_JIRACHI";
})(MissionSubtypeChallenge || (MissionSubtypeChallenge = {}));
var MissionSubtypeExplore;
(function (MissionSubtypeExplore) {
  MissionSubtypeExplore[MissionSubtypeExplore["MISSION_EXPLORE_NORMAL"] = 0] = "MISSION_EXPLORE_NORMAL";
  MissionSubtypeExplore[MissionSubtypeExplore["MISSION_EXPLORE_SEALED_CHAMBER"] = 1] = "MISSION_EXPLORE_SEALED_CHAMBER";
  MissionSubtypeExplore[MissionSubtypeExplore["MISSION_EXPLORE_GOLDEN_CHAMBER"] = 2] = "MISSION_EXPLORE_GOLDEN_CHAMBER";
  MissionSubtypeExplore[MissionSubtypeExplore["MISSION_EXPLORE_NEW_DUNGEON"] = 3] = "MISSION_EXPLORE_NEW_DUNGEON";
})(MissionSubtypeExplore || (MissionSubtypeExplore = {}));
var MissionSubtypeOutlaw;
(function (MissionSubtypeOutlaw) {
  MissionSubtypeOutlaw[MissionSubtypeOutlaw["MISSION_OUTLAW_NORMAL_0"] = 0] = "MISSION_OUTLAW_NORMAL_0";
  MissionSubtypeOutlaw[MissionSubtypeOutlaw["MISSION_OUTLAW_NORMAL_1"] = 1] = "MISSION_OUTLAW_NORMAL_1";
  MissionSubtypeOutlaw[MissionSubtypeOutlaw["MISSION_OUTLAW_NORMAL_2"] = 2] = "MISSION_OUTLAW_NORMAL_2";
  MissionSubtypeOutlaw[MissionSubtypeOutlaw["MISSION_OUTLAW_NORMAL_3"] = 3] = "MISSION_OUTLAW_NORMAL_3";
  MissionSubtypeOutlaw[MissionSubtypeOutlaw["MISSION_OUTLAW_ESCORT"] = 4] = "MISSION_OUTLAW_ESCORT";
  MissionSubtypeOutlaw[MissionSubtypeOutlaw["MISSION_OUTLAW_FLEEING"] = 5] = "MISSION_OUTLAW_FLEEING";
  MissionSubtypeOutlaw[MissionSubtypeOutlaw["MISSION_OUTLAW_HIDEOUT"] = 6] = "MISSION_OUTLAW_HIDEOUT";
  MissionSubtypeOutlaw[MissionSubtypeOutlaw["MISSION_OUTLAW_MONSTER_HOUSE"] = 7] = "MISSION_OUTLAW_MONSTER_HOUSE";
})(MissionSubtypeOutlaw || (MissionSubtypeOutlaw = {}));
var MissionSubtypeTakeItem;
(function (MissionSubtypeTakeItem) {
  MissionSubtypeTakeItem[MissionSubtypeTakeItem["MISSION_TAKE_ITEM_NORMAL_OUTLAW"] = 0] = "MISSION_TAKE_ITEM_NORMAL_OUTLAW";
  MissionSubtypeTakeItem[MissionSubtypeTakeItem["MISSION_TAKE_ITEM_HIDDEN_OUTLAW"] = 1] = "MISSION_TAKE_ITEM_HIDDEN_OUTLAW";
  MissionSubtypeTakeItem[MissionSubtypeTakeItem["MISSION_TAKE_ITEM_FLEEING_OUTLAW"] = 2] = "MISSION_TAKE_ITEM_FLEEING_OUTLAW";
})(MissionSubtypeTakeItem || (MissionSubtypeTakeItem = {}));
//
// Floor Generation Status
//
var FloorSize;
(function (FloorSize) {
  FloorSize[FloorSize["FLOOR_SIZE_LARGE"] = 0] = "FLOOR_SIZE_LARGE";
  FloorSize[FloorSize["FLOOR_SIZE_SMALL"] = 1] = "FLOOR_SIZE_SMALL";
  FloorSize[FloorSize["FLOOR_SIZE_MEDIUM"] = 2] = "FLOOR_SIZE_MEDIUM";
})(FloorSize || (FloorSize = {}));
var HiddenStairsType;
(function (HiddenStairsType) {
  HiddenStairsType[HiddenStairsType["HIDDEN_STAIRS_NONE"] = 0] = "HIDDEN_STAIRS_NONE";
  HiddenStairsType[HiddenStairsType["HIDDEN_STAIRS_SECRET_BAZAAR"] = 1] = "HIDDEN_STAIRS_SECRET_BAZAAR";
  HiddenStairsType[HiddenStairsType["HIDDEN_STAIRS_SECRET_ROOM"] = 2] = "HIDDEN_STAIRS_SECRET_ROOM";
  HiddenStairsType[HiddenStairsType["HIDDEN_STAIRS_RANDOM_SECRET_BAZAAR_OR_SECRET_ROOM"] = 255] = "HIDDEN_STAIRS_RANDOM_SECRET_BAZAAR_OR_SECRET_ROOM";
})(HiddenStairsType || (HiddenStairsType = {}));
//
// Dungeon Algorithm Types
//
// The dungeon floor type
// see: GetFloorType
var FloorType;
(function (FloorType) {
  FloorType[FloorType["FLOOR_TYPE_NORMAL"] = 0] = "FLOOR_TYPE_NORMAL";
  FloorType[FloorType["FLOOR_TYPE_FIXED"] = 1] = "FLOOR_TYPE_FIXED";
  FloorType[FloorType["FLOOR_TYPE_RESCUE"] = 2] = "FLOOR_TYPE_RESCUE";
})(FloorType || (FloorType = {}));
/**
 * DirectionId - Direction on the dungeon grid
 *
 * Enum values can be mapped to offsets in LIST_DIRECTIONS
 */
var DirectionId;
(function (DirectionId) {
  DirectionId[DirectionId["DIR_NONE"] = 4294967295] = "DIR_NONE";
  DirectionId[DirectionId["DIR_DOWN"] = 0] = "DIR_DOWN";
  DirectionId[DirectionId["DIR_DOWN_RIGHT"] = 1] = "DIR_DOWN_RIGHT";
  DirectionId[DirectionId["DIR_RIGHT"] = 2] = "DIR_RIGHT";
  DirectionId[DirectionId["DIR_UP_RIGHT"] = 3] = "DIR_UP_RIGHT";
  DirectionId[DirectionId["DIR_UP"] = 4] = "DIR_UP";
  DirectionId[DirectionId["DIR_UP_LEFT"] = 5] = "DIR_UP_LEFT";
  DirectionId[DirectionId["DIR_LEFT"] = 6] = "DIR_LEFT";
  DirectionId[DirectionId["DIR_DOWN_LEFT"] = 7] = "DIR_DOWN_LEFT";
  DirectionId[DirectionId["DIR_CURRENT"] = 8] = "DIR_CURRENT";
})(DirectionId || (DirectionId = {}));
//
// Dungeon Algorithm Helper Types (not part of original code)
//
/**
 * CardinalDirection - used to help make 4-directional branching readable
 *
 * Not part of the original code
 */
var CardinalDirection;
(function (CardinalDirection) {
  CardinalDirection[CardinalDirection["DIR_RIGHT"] = 0] = "DIR_RIGHT";
  CardinalDirection[CardinalDirection["DIR_UP"] = 1] = "DIR_UP";
  CardinalDirection[CardinalDirection["DIR_LEFT"] = 2] = "DIR_LEFT";
  CardinalDirection[CardinalDirection["DIR_DOWN"] = 3] = "DIR_DOWN";
})(CardinalDirection || (CardinalDirection = {}));
/**
 * SecondaryStructureType - for readability in GenerateSecondaryStructures
 *
 * Not part of the original code
 */
var SecondaryStructureType;
(function (SecondaryStructureType) {
  SecondaryStructureType[SecondaryStructureType["SECONDARY_STRUCTURE_NONE"] = 0] = "SECONDARY_STRUCTURE_NONE";
  SecondaryStructureType[SecondaryStructureType["SECONDARY_STRUCTURE_MAZE_PLUS_DOT"] = 1] = "SECONDARY_STRUCTURE_MAZE_PLUS_DOT";
  SecondaryStructureType[SecondaryStructureType["SECONDARY_STRUCTURE_CHECKERBOARD"] = 2] = "SECONDARY_STRUCTURE_CHECKERBOARD";
  SecondaryStructureType[SecondaryStructureType["SECONDARY_STRUCTURE_POOL"] = 3] = "SECONDARY_STRUCTURE_POOL";
  SecondaryStructureType[SecondaryStructureType["SECONDARY_STRUCTURE_ISLAND"] = 4] = "SECONDARY_STRUCTURE_ISLAND";
  SecondaryStructureType[SecondaryStructureType["SECONDARY_STRUCTURE_DIVIDER"] = 5] = "SECONDARY_STRUCTURE_DIVIDER";
})(SecondaryStructureType || (SecondaryStructureType = {}));
/**
 * GenerationStepLevel - specifies significance level of a callback event
 *
 * Not part of the original code
 */
var GenerationStepLevel;
(function (GenerationStepLevel) {
  GenerationStepLevel[GenerationStepLevel["GEN_STEP_COMPLETE"] = 0] = "GEN_STEP_COMPLETE";
  GenerationStepLevel[GenerationStepLevel["GEN_STEP_MAJOR"] = 1] = "GEN_STEP_MAJOR";
  GenerationStepLevel[GenerationStepLevel["GEN_STEP_MINOR"] = 2] = "GEN_STEP_MINOR";
})(GenerationStepLevel || (GenerationStepLevel = {}));
/**
 * MajorGenerationType - Specifications for types of major events that have occurred (ex. created all rooms/anchors)
 *
 * Not part of the original code
 */
var MajorGenerationType;
(function (MajorGenerationType) {
  MajorGenerationType[MajorGenerationType["GEN_TYPE_RESET_FLOOR"] = 0] = "GEN_TYPE_RESET_FLOOR";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_INIT_DUNGEON_GRID"] = 1] = "GEN_TYPE_INIT_DUNGEON_GRID";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_CREATE_ROOMS_AND_ANCHORS"] = 2] = "GEN_TYPE_CREATE_ROOMS_AND_ANCHORS";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_CREATE_GRID_CELL_CONNECTIONS"] = 3] = "GEN_TYPE_CREATE_GRID_CELL_CONNECTIONS";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_ENSURE_CONNECTED_GRID"] = 4] = "GEN_TYPE_ENSURE_CONNECTED_GRID";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_GENERATE_MAZE_ROOM"] = 5] = "GEN_TYPE_GENERATE_MAZE_ROOM";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_GENERATE_KECLEON_SHOP"] = 6] = "GEN_TYPE_GENERATE_KECLEON_SHOP";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_GENERATE_MONSTER_HOUSE"] = 7] = "GEN_TYPE_GENERATE_MONSTER_HOUSE";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_GENERATE_EXTRA_HALLWAYS"] = 8] = "GEN_TYPE_GENERATE_EXTRA_HALLWAYS";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_GENERATE_ROOM_IMPERFECTIONS"] = 9] = "GEN_TYPE_GENERATE_ROOM_IMPERFECTIONS";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_GENERATE_SECONDARY_STRUCTURES"] = 10] = "GEN_TYPE_GENERATE_SECONDARY_STRUCTURES";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_ONE_ROOM_MONSTER_HOUSE_FLOOR"] = 11] = "GEN_TYPE_ONE_ROOM_MONSTER_HOUSE_FLOOR";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_OUTER_RING_FLOOR"] = 12] = "GEN_TYPE_OUTER_RING_FLOOR";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_CROSSROADS_FLOOR"] = 13] = "GEN_TYPE_CROSSROADS_FLOOR";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_TWO_ROOMS_WITH_MONSTER_HOUSE_FLOOR"] = 14] = "GEN_TYPE_TWO_ROOMS_WITH_MONSTER_HOUSE_FLOOR";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_MERGE_ROOM_VERTICALLY"] = 15] = "GEN_TYPE_MERGE_ROOM_VERTICALLY";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_GENERATE_SECONDARY_TERRAIN"] = 16] = "GEN_TYPE_GENERATE_SECONDARY_TERRAIN";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_SPAWN_NON_ENEMIES"] = 17] = "GEN_TYPE_SPAWN_NON_ENEMIES";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_SPAWN_ENEMIES"] = 18] = "GEN_TYPE_SPAWN_ENEMIES";
  MajorGenerationType[MajorGenerationType["GEN_TYPE_GENERATE_FLOOR"] = 19] = "GEN_TYPE_GENERATE_FLOOR";
})(MajorGenerationType || (MajorGenerationType = {}));
/**
 * MinorGenerationType - Specifications for types of minor events that have occurred (ex. created a hallway)
 *
 * Not part of the original code
 */
var MinorGenerationType;
(function (MinorGenerationType) {
  MinorGenerationType[MinorGenerationType["GEN_TYPE_CREATE_ROOM"] = 0] = "GEN_TYPE_CREATE_ROOM";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_CREATE_ANCHOR"] = 1] = "GEN_TYPE_CREATE_ANCHOR";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_CREATE_HALLWAY"] = 2] = "GEN_TYPE_CREATE_HALLWAY";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_MERGE_ROOM"] = 3] = "GEN_TYPE_MERGE_ROOM";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_ENSURE_CONNECTED_HALLWAY"] = 4] = "GEN_TYPE_ENSURE_CONNECTED_HALLWAY";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_REMOVE_UNCONNECTED_ANCHOR"] = 5] = "GEN_TYPE_REMOVE_UNCONNECTED_ANCHOR";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_REMOVE_UNCONNECTED_ROOM"] = 6] = "GEN_TYPE_REMOVE_UNCONNECTED_ROOM";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_GENERATE_EXTRA_HALLWAY"] = 7] = "GEN_TYPE_GENERATE_EXTRA_HALLWAY";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_GENERATE_ROOM_IMPERFECTION"] = 8] = "GEN_TYPE_GENERATE_ROOM_IMPERFECTION";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_GENERATE_SECONDARY_STRUCTURE"] = 9] = "GEN_TYPE_GENERATE_SECONDARY_STRUCTURE";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_MERGE_ROOM_VERTICALLY"] = 10] = "GEN_TYPE_MERGE_ROOM_VERTICALLY";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SECONDARY_TERRAIN_RIVER"] = 11] = "GEN_TYPE_SECONDARY_TERRAIN_RIVER";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SECONDARY_TERRAIN_RIVER_LAKE"] = 12] = "GEN_TYPE_SECONDARY_TERRAIN_RIVER_LAKE";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SECONDARY_TERRAIN_STANDALONE_LAKE"] = 13] = "GEN_TYPE_SECONDARY_TERRAIN_STANDALONE_LAKE";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SPAWN_STAIRS"] = 14] = "GEN_TYPE_SPAWN_STAIRS";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SPAWN_ITEMS"] = 15] = "GEN_TYPE_SPAWN_ITEMS";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SPAWN_BURIED_ITEMS"] = 16] = "GEN_TYPE_SPAWN_BURIED_ITEMS";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SPAWN_MONSTER_HOUSE_ITEMS_TRAPS"] = 17] = "GEN_TYPE_SPAWN_MONSTER_HOUSE_ITEMS_TRAPS";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SPAWN_TRAPS"] = 18] = "GEN_TYPE_SPAWN_TRAPS";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SPAWN_PLAYER"] = 19] = "GEN_TYPE_SPAWN_PLAYER";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SPAWN_NON_MONSTER_HOUSE_ENEMIES"] = 20] = "GEN_TYPE_SPAWN_NON_MONSTER_HOUSE_ENEMIES";
  MinorGenerationType[MinorGenerationType["GEN_TYPE_SPAWN_MONSTER_HOUSE_EXTRA_ENEMIES"] = 21] = "GEN_TYPE_SPAWN_MONSTER_HOUSE_EXTRA_ENEMIES";
})(MinorGenerationType || (MinorGenerationType = {}));

/**
 * room_flags - 1-byte bitfield
 */
var RoomFlags = function RoomFlags() {
  this.f_secondary_terrain_generation = false; // 0x0: Is secondary terrain generation allowed
  //room_flags_unk1: number; //1
  this.f_room_imperfections = false; // 0x2: Are room imperfections allowed
  //room_flags_unk3: number; //5
};
/**
 * terrain_flags -
 */
var TerrainFlags = function TerrainFlags() {
  this.terrain_type = TerrainType.TERRAIN_WALL;
  this.f_corner_cuttable = false; // This tile can be corner-cut when walking. Seemingly only used during dungeon generation.
  // Includes room tiles right next to a hallway, and branching points within corridors.
  // Only applies to natural halls, not ones made by Absolute Mover, not "hallways" made of
  // secondary terrain, etc. Used by the AI for navigation.
  this.f_natural_junction = false;
  // This tile is impassable, even with Absolute Mover/Mobile Scarf. Used for the map border,
  // key chamber walls, walls in boss battle rooms, etc.
  this.f_impassable_wall = false;
  this.f_in_kecleon_shop = false;
  this.f_in_monster_house = false;
  this.terrain_flags_unk7 = false;
  this.f_unbreakable = false; // Cannot be broken by Absolute Mover. Set naturally on key doors.
  this.f_stairs = false; // Tile is any type of "stairs" (normal stairs, Hidden Stairs, Warp Zone)
  this.terrain_flags_unk10 = false;
  this.f_key_door = false;
  this.f_key_door_key_locked = false;
  this.f_key_door_escort_locked = false; // Key door is locked and requires an escort to open (for Sealed Chamber missions)
  this.terrain_flags_unk14 = false;
  this.f_unreachable_from_stairs = false;
};
/**
 * spawn_flags - 2-byte bitfield
 */
var SpawnFlags = function SpawnFlags() {
  this.f_stairs = false;
  this.f_item = false;
  this.f_trap = false;
  this.f_monster = false;
  this.f_special_tile = false; //set for kecleon, items, traps
  //TODO: Identify these, they are used in the current code
  this.spawn_flags_field_0x5 = false;
  this.spawn_flags_field_0x6 = false;
  this.spawn_flags_field_0x7 = false;
  //There are more spawn flags here, but they don't appear to be relevant
};
/**
 * mission_destination_info - Information about a mission destination floor
 */
var MissionDestinationInfo = function MissionDestinationInfo() {
  this.is_destination_floor = false; // 0x0
  this.mission_type = MissionType.MISSION_RESCUE_CLIENT; // 0x1
  this.mission_subtype = MissionSubtypeChallenge.MISSION_CHALLENGE_NORMAL; // 0x2
};

var StairsReachableFlags = function StairsReachableFlags() {
  this.f_cannot_corner_cut = false;
  this.f_secondary_terrain_cannot_corner_cut = false;
  this.f_unknown_field_0x2 = false; //used for corners
  this.f_starting_point = false;
  this.f_in_visit_queue = false;
  this.f_visited = false;
};

/**
 * A Grid Cell refers to a single enclosed tile-space of the dungeon map.
 * These are used in dungeon.ts to form a matrix of grid cells that represent the entire map.
 *
 * Each individual grid cell can hold one room or hallway anchor (or nothing if its contents are deleted later in generation).
 *
 * Grid Cells are an important level of abstraction above the tile space, though they aren't used once dungeon generation has finished.
 */
var GridCell = function GridCell() {
  //Defines the enclosing rectangular room space for this grid cell on the dungeon map [start_x, end_x), [start_y, end_y)
  this.start_x = 0;
  this.start_y = 0;
  this.end_x = 0;
  this.end_y = 0;
  this.is_invalid = false;
  this.has_secondary_structure = false;
  this.is_room = false;
  this.is_connected = false;
  this.is_kecleon_shop = false;
  this.unk3 = false;
  this.is_monster_house = false;
  this.unk4 = false;
  this.is_maze_room = false;
  this.has_been_merged = false;
  this.is_merged = false;
  this.connected_to_top = false;
  this.connected_to_bottom = false;
  this.connected_to_left = false;
  this.connected_to_right = false;
  this.should_connect_to_top = false;
  this.should_connect_to_bottom = false;
  this.should_connect_to_left = false;
  this.should_connect_to_right = false;
  this.unk5 = false;
  this.flag_imperfect = false;
  this.flag_secondary_structure = false;
};
/**
 * A Tile is one individual square on the actual dungeon map.
 *
 * Most of its relevant properties are contained in TerrainFlags and SpawnFlags, which specify how the
 * tile operates and what it will look like.
 */
var Tile = function Tile() {
  this.terrain_flags = new TerrainFlags();
  this.spawn_or_visibility_flags = new SpawnFlags(); // Technically context-dependent, but is always SpawnFlags for dungeon gen
  this.texture_id = 0;
  this.room_index = 0xff; // 0xFF = Not a room, 0xFE = hallway anchors (set to 0xFF later). Other values are room indexes
  //TODO: Investigate relevance of flags
  //walkable_neighbor_flags: boolean[];
};
/**
 * Floor Properties defines many of the key properties for dungeon generation, such as
 * the type of layout, base number of rooms, and floor connectivity.
 *
 * It's worth noting that not all settings affecting dungeon generation are contained here, as
 * various other properties in Dungeon can also impact how the floor will generate.
 */
var FloorProperties = function FloorProperties() {
  this.layout = FloorLayout.LAYOUT_SMALL;
  this.room_density = 4;
  this.floor_connectivity = 15;
  this.enemy_density = 0;
  this.kecleon_shop_chance = 0; //Percentage chance 0-100%
  this.monster_house_chance = 0; //Percentage chance 0-100%
  this.maze_room_chance = 0; //Percentage chance 0-100%
  this.allow_dead_ends = false;
  this.secondary_structures_budget = 0; //Maximum number of secondary structures that can be generated
  this.room_flags = new RoomFlags();
  this.item_density = 0;
  this.trap_density = 0;
  this.floor_number = 0;
  this.fixed_room_id = 0;
  this.num_extra_hallways = 0;
  this.buried_item_density = 0; //Density of buried items (in walls)
  this.secondary_terrain_density = 10; //Controls how much secondary terrain is spawned
  this.itemless_monster_house_chance = 0; //Chance that a monster house will be itemless
  this.hidden_stairs_type = HiddenStairsType.HIDDEN_STAIRS_NONE;
  this.hidden_stairs_spawn_chance = 0;
};
/**
 * NA: 0237CFBC
 * Floor Generation Status holds many of the runtime values for dungeon generation
 *
 * Generally, most of these values are copied from other existing data, but some like has_monster_house
 * do record information as generation progresses.
 */
var FloorGenerationStatus = function FloorGenerationStatus() {
  this.second_spawn = false; // 0x0
  this.has_monster_house = false; // 0x1: This floor has a monster house
  this.stairs_room_index = 0; // 0x2: The index of the room containing the stairs
  this.has_kecleon_shop = false; // 0x3: This floor has a Kecleon Shop
  this.has_chasms_as_secondary_terrain = false; // 0x4: Secondary Terrain Type is SECONDARY_TERRAIN_CHASM
  this.is_invalid = false; // 0x5: Set when floor generation fails (except that it's never actually set..?)
  this.floor_size = FloorSize.FLOOR_SIZE_LARGE; // 0x6
  this.has_maze = false; // 0x7: This floor has a maze room
  this.no_enemy_spawn = false; // 0x8: No enemies should spawn on this floor
  this.kecleon_shop_chance = 100; // 0xC
  this.monster_house_chance = 0; // 0x10
  this.num_rooms = 0; // 0x14: Number of rooms this floor should have
  this.secondary_structures_budget = 0; // 0x18
  //Location of the hidden stairs, -1 indicates no Hidden Stairs
  this.hidden_stairs_spawn_x = 0; // 0x1C
  this.hidden_stairs_spawn_y = 0; // 0x1E
  //Location of the middle of the kecleon shop, if applicable
  this.kecleon_shop_middle_x = 0; // 0x20
  this.kecleon_shop_middle_y = 0; // 0x22
  this.num_tiles_reachable_from_stairs = 0; // 0x24 Number of tiles reachable from the stairs assuming normal mobility
  this.layout = FloorLayout.LAYOUT_LARGE; // 0x28
  this.hidden_stairs_type = HiddenStairsType.HIDDEN_STAIRS_NONE; // 0x2C
  // The limits of the Kecleon Shop, if applicable
  this.kecleon_shop_min_x = 0; // 0x30
  this.kecleon_shop_min_y = 0; // 0x34
  this.kecleon_shop_max_x = 0; // 0x38
  this.kecleon_shop_max_y = 0; // 0x3C
};
/**
 * Dungeon Generation Info provides additional information about dungeon generation
 * at runtime.
 */
var DungeonGenerationInfo = function DungeonGenerationInfo() {
  this.force_create_monster_house = false; // 0x0
  this.monster_house_room = -1; // 0x5
  this.hidden_stairs_type = HiddenStairsType.HIDDEN_STAIRS_NONE; // 0x8
  this.fixed_room_id = 0; // 0x16
  this.floor_generation_attempts = 0; //0x1A
  this.player_spawn_x = -1; // 0x8C1C
  this.player_spawn_y = -1;
  this.stairs_spawn_x = -1; // 0x8C20
  this.stairs_spawn_y = -1;
  this.hidden_stairs_spawn_x = -1; // 0x8C24
  this.hidden_stairs_spawn_y = -1;
};
/**
 * NA: 02353538
 * Dungeon - Essentially the master class for just about all properties.
 *
 * Holds various key data, as well as the dungeon map: list_tiles
 */
var Dungeon = function Dungeon() {
  this.id = 1; // 0x748: Current Dungeon ID
  this.floor = 1; // 0x749: Current floor number
  this.rescue_floor = 1; // 0x751
  this.nonstory_flag = true; // 0x75C
  this.mission_destination = new MissionDestinationInfo(); //0x760
  this.dungeon_objective = DungeonObjectiveType.OBJECTIVE_NORMAL; // 0x798
  this.kecleon_shop_min_x = 0; // 0xCD14
  this.kecleon_shop_min_y = 0; // 0xCD18
  this.kecleon_shop_max_x = 0; // 0xCD1C
  this.kecleon_shop_max_y = 0; // 0xCD20
  this.num_items = 0; // 0x12AFA This number is generated, not a property
  this.guaranteed_item_id = 0; // 0x2C9E8
  this.n_floors_plus_one = 4; // 0x2CAF4: One more than the maximum number of floors in the current dungeon
  //field_0x12aa4: boolean = false;
  //field_0x3fc2: boolean = false;
  this.list_tiles = []; //This is the dungeon map
  this.fixed_room_tiles = [];
  this.active_traps = new Array(64);
};

//TODO: This class has not been set up to use original behavior and is currently using JS Random
var LCG_MULTIPLIER = 0x5d588b65;
var ADD_T1 = 0x269ec3;
//2^32
//const MODULUS = 0x100000000;
/*
function dec2bin(dec: number)
{
    return (dec >>> 0).toString(2);
}*/
//NA: 02353570
var DungeonRandom = /*#__PURE__*/function () {
  function DungeonRandom() {
    this.use_secondary = false;
    //type 0
    this.seq_num_primary = 0;
    this.preseed = 0;
    this.last_value_primary = 0;
    //type 1
    this.idx_secondary = 0;
    this.seeds_t1 = Array(5);
    this.showDebug = false;
  }
  var _proto = DungeonRandom.prototype;
  _proto.SetShowDebug = function SetShowDebug(showDebug) {
    this.showDebug = showDebug;
  };
  _proto.SetDungeonRngPreseed = function SetDungeonRngPreseed(preseed) {
    this.preseed = preseed;
  }
  /**
   * NA: 022EA980
   * GenerateDungeonRngSeed - Seed for initializing the dungeon Primary RNG
   *
   * Based on the preseed, performs two Primary LCG iterations
   * Stores the second iteration as a new preseed, returns an RNG seed
   */;
  _proto.GenerateDungeonRngSeed = function GenerateDungeonRngSeed() {
    var firstIter = this.preseed * LCG_MULTIPLIER + 1;
    var secondIter = firstIter * LCG_MULTIPLIER + 1;
    this.preseed = secondIter;
    //console.log("GenerateDungeonRngSeed " + [firstIter, secondIter, (secondIter & 0xff0000) | (firstIter >> 0x10) | 1]);
    return secondIter & 0xff0000 | firstIter >> 0x10 | 1;
  };
  _proto.InitDungeonRng = function InitDungeonRng(seed) {
    this.last_value_primary = seed | 1;
    this.seq_num_primary = 0;
    for (var i = 0; i < this.seeds_t1.length; i++) {
      this.seeds_t1[i] = seed;
    }
  }
  /**
   * NA: 022EAA20
   * DungeonRand16Bit
   *
   * returns: pseudorandom integer on the interval [0, 65535]
   */;
  _proto.Rand16Bit = function Rand16Bit() {
    var result;
    if (!this.use_secondary) {
      this.seq_num_primary++;
      var intermediate = this.last_value_primary * LCG_MULTIPLIER + 1;
      //console.log("Intermediate: " + intermediate + " Binary: " + dec2bin(intermediate));
      result = intermediate & 0xffff0000;
      //console.log("New Result: " + result + " Binary: " + dec2bin(result));
      this.last_value_primary = intermediate;
    } else {
      result = LCG_MULTIPLIER * this.seeds_t1[this.idx_secondary] + ADD_T1;
      this.seeds_t1[this.idx_secondary] = result;
      result = result * 0x10000;
    }
    return result >> 0x10; //Right shift 16
  }
  /**
   * NA: 022EAA98
   * DungeonRandInt
   *
   * returns: pseudorandom integer on the interval [0, n - 1]
   */;
  _proto.RandInt = function RandInt(n) {
    /*
        let value = this.Rand16Bit();
        return ((value & 0xFFFF) * n) >> 0x10 & 0xFFFF;*/
    return Math.floor(Math.random() * n);
  }
  /**
   * NA: 022EAAC0
   * DungeonRandRange
   *
   * returns: pseudorandom integer on the interval [min(x, y), max(x, y) - 1]
   */;
  _proto.RandRange = function RandRange(x, y) {
    /*
        let randValue;
              if(x == y) return x;
              randValue = this.Rand16Bit();*/
    if (x < y) {
      //return x + (((randValue & 0xFFFF) * (y - x)) >> 0x10) & 0xFFFF; //0xFFFF should be unsigned
      return Math.floor(Math.random() * (y - x)) + x;
    } else {
      //return y + (((randValue & 0xFFFF) * (x - y)) >> 0x10) & 0xFFFF;
      return Math.floor(Math.random() * (x - y)) + y;
    }
  }
  /**
   * NA: 022EAC5C
   * DungeonRngSetSecondary - Sets the Dungeon PRNG to use one of the 5 secondary LCGs for random number generation.
   */;
  _proto.DungeonRngSetSecondary = function DungeonRngSetSecondary(secondary_index) {
    this.use_secondary = true;
    this.idx_secondary = secondary_index;
  };
  return DungeonRandom;
}();

/**
 * Defines key constant values for floor generation, providing a way
 * to modify these constants if desired.
 */
var GenerationConstants = function GenerationConstants() {
  this.merge_rooms_chance = 5; // (0 to 100) probability to merge two rooms together
  this.no_imperfections_chance = 60; // (0 to 100) probability that a room will not have imperfections, if it was already flagged for them
  this.secondary_structure_flag_chance = 80; // (0 to 100) probability that a room will be flagged to have a secondary structure.
  this.max_number_monster_house_item_spawns = 7; //Maximum number of items allowed to be spawned in a monster house.
  this.max_number_monster_house_enemy_spawns = 30; //Maximum number of enemies allowed to be spawned in a monster house.
  this.first_dungeon_id_allow_monster_house_traps = 28; //The first story dungeon that allows traps in monster houses (Dark Hill by default)
};
/**
 * Defines advanced settings for applying patches or changes to the original dungeon algorithm implementation
 *
 * These settings are all disabled by default for vanilla generation.
 */
var AdvancedGenerationSettings = function AdvancedGenerationSettings() {
  /**
   * In GenerateMazeRoom, one of the initial checks tests if the current number of
   * floor generation attempts is below 0, which is an impossible condition.
   *
   * This results in no maze rooms made of walls ever being generated in the vanilla game.
   * (Water mazes can still be generated via secondary structures, they call a sub-function
   * to generate the maze)
   *
   * This patch overrides this check, allowing GenerateMazeRoom to continue and potentially
   * generate a maze in this manner.
   */
  this.allow_wall_maze_room_generation = false;
  /**
   * In AssignGridCellConnections, the second half of the function is dedicated to
   * removing dead ends from floor generation if specified in the floor's properties.
   *
   * Part of this process is searching for grid cells with only one connection (a dead end),
   * then seeing if there is another grid cell that is adjacent that we can connect to.
   *
   * A bug appears in that all of the four validation checks to ensure the grid cell
   * in the specified direction is valid end up using the same offset, meaning 3
   * of them are checking the wrong grid cell.
   *
   * This patch fixes these checks to ensure that the correct grid cell is checked in all
   * directions.
   */
  this.fix_dead_end_validation_error = false;
  /**
   * In GenerateOuterRoomsFloor (a layout where there are exclusively rooms on the outer ring of the floor),
   * there is an error involved in building the connections between grid cells to create the ring
   * of rooms.
   *
   * This error results in the original implementation failing for grid_size_x <= 2, as one
   * of the branches for assigning connections is never taken, and the other branch will not
   * provide a backup connection.
   *
   * There is also a minor issue involving top/bottom connections which results in hallways
   * being connected from the bottom instead of from the top, but this does not affect the
   * connectivity of the map.
   *
   * This patch fixes the error and minor issues within the function, providing
   * consistently connected generation for all grid sizes.
   */
  this.fix_generate_outer_rooms_floor_error = false;
};

var FLOOR_MAX_X = 56;
var FLOOR_MAX_Y = 32;
var DEFAULT_MAX_POSITION = 9999; //NA: 0233FF98
var DEFAULT_TILE = /*#__PURE__*/new Tile();
//
//Globals
//
var dungeonData;
var dungeonGenerationInfo;
var statusData;
var dungeonRand;
var generationConstants;
var advancedGenerationSettings;
var grid_cell_start_x = [];
var grid_cell_start_y = [];
var dungeonGenerationCallback;
var generationCallbackFrequency;
/**
 * NA: 02340CAC
 * PosIsOutOfBounds - Checks if a position is out of bounds on the map.
 */
function PosIsOutOfBounds(x, y) {
  return x < 0 || x >= FLOOR_MAX_X || y < 0 || y >= FLOOR_MAX_Y;
}
/**
 * NA: 02340B0C
 * ResetFloor - Resets the floor in preparation for a floor generation attempt.
 *
 * Resets all tiles, ensures the border is impassable, and clears entity spawns.
 */
function ResetFloor() {
  dungeonData.list_tiles = new Array(FLOOR_MAX_X);
  //Reset Room Tiles
  for (var x = 0; x < FLOOR_MAX_X; x++) {
    dungeonData.list_tiles[x] = new Array(FLOOR_MAX_Y);
    for (var y = 0; y < FLOOR_MAX_Y; y++) {
      dungeonData.list_tiles[x][y] = new Tile();
      if (PosIsOutOfBounds(x - 1, y) || PosIsOutOfBounds(x, y - 1) || PosIsOutOfBounds(x + 1, y) || PosIsOutOfBounds(x, y + 1) || PosIsOutOfBounds(x - 1, y - 1) || PosIsOutOfBounds(x - 1, y + 1) || PosIsOutOfBounds(x + 1, y - 1) || PosIsOutOfBounds(x + 1, y + 1)) {
        dungeonData.list_tiles[x][y].terrain_flags.f_impassable_wall = true;
      }
    }
  }
  //Reset Stairs Position
  dungeonGenerationInfo.stairs_spawn_x = -1;
  dungeonGenerationInfo.stairs_spawn_y = -1;
  dungeonData.fixed_room_tiles = new Array(8);
  //Reset Fixed Room Tiles
  for (var _x = 0; _x < 8; _x++) {
    dungeonData.fixed_room_tiles[_x] = new Array(8);
    for (var _y = 0; _y < 8; _y++) {
      dungeonData.fixed_room_tiles[_x][_y] = new Tile();
    }
  }
  dungeonData.num_items = 0;
  //Reset Traps
  dungeonData.active_traps = Array(64);
  grid_cell_start_x = [];
  grid_cell_start_y = [];
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_RESET_FLOOR);
}
/**
 * NA: 0233CF84
 * GetGridPositions - Determines the starting positions of grid cells based on the given floor grid dimensions
 *
 * Returns:
 * list_x: Starting x coordinates for each grid column
 * list_y: Starting y coordinates for each grid row
 */
function GetGridPositions(grid_size_x, grid_size_y) {
  var sum_x = 0,
    sum_y = 0;
  var list_x = [],
    list_y = [];
  //<= is intentional here
  for (var x = 0; x <= grid_size_x; x++) {
    list_x.push(sum_x);
    sum_x += Math.floor(FLOOR_MAX_X / grid_size_x); //This is our grid step size
  }

  for (var y = 0; y <= grid_size_y; y++) {
    list_y.push(sum_y);
    sum_y += Math.floor(FLOOR_MAX_Y / grid_size_y);
  }
  return {
    list_x: list_x,
    list_y: list_y
  };
}
/**
 * NA: 0233D004
 * InitDungeonGrid - Initializes the default state of the dungeon grid
 *
 * The dungeon grid is an array of grid cells stored in column-major order
 * (to give contiguous storage to cells with the same x value), with a fixed column size of 15.
 *
 * Returns: initialized dungeon grid
 */
function InitDungeonGrid(grid_size_x, grid_size_y) {
  var grid = Array(15);
  for (var x = 0; x < 15; x++) {
    grid[x] = Array(15);
    for (var y = 0; y < 15; y++) {
      grid[x][y] = new GridCell();
    }
  }
  for (var _x2 = 0; _x2 < grid_size_x; _x2++) {
    for (var _y2 = 0; _y2 < grid_size_y; _y2++) {
      if (statusData.floor_size === FloorSize.FLOOR_SIZE_SMALL && _x2 >= Math.floor(grid_size_x / 2)) {
        grid[_x2][_y2].is_invalid = true;
      } else if (statusData.floor_size === FloorSize.FLOOR_SIZE_MEDIUM && _x2 >= Math.floor(3 * grid_size_x / 4)) {
        grid[_x2][_y2].is_invalid = true;
      } else {
        grid[_x2][_y2].is_invalid = false;
      }
      grid[_x2][_y2].is_room = true;
    }
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_INIT_DUNGEON_GRID);
  return grid;
}
/**
 * NA: 0233D104
 * AssignRooms - Randomly selects a subset of grid cells to become rooms
 *
 * If number_of_rooms is positive, number_of_rooms + [0..2] will become rooms
 * If the selected cells for rooms are invalid, less rooms will be generated.
 * The number of rooms assigned will always be at least 2 and always <= 36.
 *
 * Any cells which aren't marked as rooms will become hallway anchors (those single 1x1 "rooms")
 * which will be connected as hallways later, to "anchor" hallway generation
 *
 * Primarily Modifies: grid to assign certain grid cells to have is_room true.
 */
function AssignRooms(grid, grid_size_x, grid_size_y, number_of_rooms) {
  var extraRooms = dungeonRand.RandInt(3);
  //A negative # for room count requests an exact number of rooms
  if (number_of_rooms < 0) {
    number_of_rooms = -number_of_rooms;
  } else {
    number_of_rooms += extraRooms;
  }
  var random_room_bits = Array(256);
  for (var i = 0; i < number_of_rooms; i++) {
    random_room_bits[i] = true;
  }
  //Shuffle around the acceptable rooms
  var max_rooms = grid_size_x * grid_size_y;
  for (var x = 0; x < 64; x++) {
    var a = dungeonRand.RandInt(max_rooms);
    var b = dungeonRand.RandInt(max_rooms);
    var temp = random_room_bits[a];
    random_room_bits[a] = random_room_bits[b];
    random_room_bits[b] = temp;
  }
  statusData.num_rooms = 0;
  var odd_x = grid_size_x % 2;
  var counter = 0;
  for (var _x3 = 0; _x3 < grid_size_x; _x3++) {
    for (var y = 0; y < grid_size_y; y++) {
      if (grid[_x3][y].is_invalid) continue;
      //There are too many rooms, remove
      if (statusData.num_rooms >= 32) {
        grid[_x3][y].is_room = false;
      }
      // Using the randomly shuffled bits, create or remove the room
      if (random_room_bits[counter]) {
        grid[_x3][y].is_room = true;
        statusData.num_rooms++;
        // Don't make a room at (x_mid, 1)
        if (odd_x !== 0 && y === 1 && _x3 === Math.floor((grid_size_x - 1) / 2)) {
          grid[_x3][y].is_room = false;
        }
      } else {
        grid[_x3][y].is_room = false;
      }
      counter++;
    }
  }
  // We have at least 2 rooms, we're done.
  if (statusData.num_rooms >= 2) return;
  var attempts = 0;
  var enoughRooms = false;
  while (attempts < 200 && !enoughRooms) {
    for (var _x4 = 0; _x4 < grid_size_x; _x4++) {
      for (var _y3 = 0; _y3 < grid_size_y; _y3++) {
        if (grid[_x4][_y3].is_invalid) continue;
        if (dungeonRand.RandInt(100) < 60) {
          grid[_x4][_y3].is_room = true;
          enoughRooms = true;
          break;
        }
      }
      if (enoughRooms) break;
    }
    attempts++;
  }
  statusData.second_spawn = false;
}
/**
 * NA: 0233D318
 * CreateRoomsAndAnchors - Creates the rectangle regions of open terrain for each room
 * leaving a margin relative to the border
 *
 * If the room is an anchor, a single tile is placed with a hallway indicator for later.
 */
function CreateRoomsAndAnchors(grid, grid_size_x, grid_size_y, list_x, list_y, room_flags) {
  var room_number = 0;
  for (var y = 0; y < grid_size_y; y++) {
    var cur_val_y = list_y[y];
    var next_val_y = list_y[y + 1];
    for (var x = 0; x < grid_size_x; x++) {
      var cur_val_x = list_x[x];
      var next_val_x = list_x[x + 1];
      var range_x = next_val_x - cur_val_x - 4;
      var range_y = next_val_y - cur_val_y - 3;
      if (grid[x][y].is_invalid) continue;
      if (!grid[x][y].is_room) {
        //This cell is not a room, create a 1x1 hallway anchor
        var unk_x1 = 2;
        var unk_x2 = 4;
        if (x === 0) {
          unk_x1 = 1;
        }
        if (x === grid_size_x - 1) {
          unk_x2 = 2;
        }
        var unk_y1 = 2;
        var unk_y2 = 4;
        if (y === 0) {
          unk_y1 = 1;
        }
        if (y === grid_size_y - 1) {
          unk_y2 = 2;
        }
        var pt_x = dungeonRand.RandRange(cur_val_x + 2 + unk_x1, cur_val_x + 2 + range_x - unk_x2);
        var pt_y = dungeonRand.RandRange(cur_val_y + 2 + unk_y1, cur_val_y + 2 + range_y - unk_y2);
        grid[x][y].start_x = pt_x;
        grid[x][y].start_y = pt_y;
        grid[x][y].end_x = pt_x + 1;
        grid[x][y].end_y = pt_y + 1;
        //Flag the tile as open to serve as a hallway anchor
        dungeonData.list_tiles[pt_x][pt_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
        //Set the room index to 0xFE for anchor
        dungeonData.list_tiles[pt_x][pt_y].room_index = 0xfe;
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_ANCHOR);
      } else {
        //This cell is a room!
        var room_size_x = dungeonRand.RandRange(5, range_x);
        var room_size_y = dungeonRand.RandRange(4, range_y);
        //Force small rooms to have odd-numbered dimensions (?)
        if ((room_size_x | 1) < range_x) {
          room_size_x |= 1;
        }
        if ((room_size_y | 1) < range_y) {
          room_size_y |= 1;
        }
        //Aspect ratio 2/3 < x/y < 3/2
        if (room_size_x > Math.floor(room_size_y * 3 / 2)) {
          room_size_x = Math.floor(room_size_y * 3 / 2);
        }
        if (room_size_y > Math.floor(room_size_x * 3 / 2)) {
          room_size_y = Math.floor(room_size_x * 3 / 2);
        }
        var start_x = dungeonRand.RandInt(range_x - room_size_x) + cur_val_x + 2;
        var end_x = start_x + room_size_x;
        var start_y = dungeonRand.RandInt(range_y - room_size_y) + cur_val_y + 2;
        var end_y = start_y + room_size_y;
        //Create the room!
        grid[x][y].start_x = start_x;
        grid[x][y].start_y = start_y;
        grid[x][y].end_x = end_x;
        grid[x][y].end_y = end_y;
        for (var room_x = start_x; room_x < end_x; room_x++) {
          for (var room_y = start_y; room_y < end_y; room_y++) {
            dungeonData.list_tiles[room_x][room_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
            dungeonData.list_tiles[room_x][room_y].room_index = room_number;
          }
        }
        //Randomly flag the room for a secondary structure
        var flag_secondary = dungeonRand.RandInt(100) < generationConstants.secondary_structure_flag_chance;
        if (statusData.secondary_structures_budget === 0) {
          flag_secondary = false;
        }
        //Flag for imperfections if needed
        var flag_imp = room_flags.f_room_imperfections;
        if (flag_secondary && flag_imp) {
          //If a room gets both, pick one at random
          if (dungeonRand.RandInt(100) < 50) {
            flag_imp = false;
          } else {
            flag_secondary = false;
          }
        }
        if (flag_imp) {
          grid[x][y].flag_imperfect = true;
        }
        if (flag_secondary) {
          grid[x][y].flag_secondary_structure = true;
        }
        room_number++;
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_ROOM);
      }
    }
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_CREATE_ROOMS_AND_ANCHORS);
}
/**
 * NA: 0233E05C
 * AssignGridCellConnections - Responsible for assigning connections to randomly adjacent grid cells
 *
 * Connections begin from the grid cell at (cursor_x, cursor_y), and are created using a
 * random walk with momentum.
 *
 * There's a 50% chance it will continue in the same direction, otherwise it will be assigned a new random direction.
 * If the direction traveled runs into the border of the map, the direction turns counterclockwise.
 * If the direction walks towards an invalid grid tile, nothing happens and iteration continues.
 *
 * The random walk will be repeated floor_connectivity number of times (specified in FloorProperties)
 *
 * Once finished, if dead ends are disabled, an additional phase occurs to remove dead end hallway anchors (not rooms)
 * The original implementation contains a bug when applying new connections to these rooms, where the incorrect
 * grid cell index will be checked for validity (always the grid cell to the right), so some connections may go to
 * invalid tiles or not be applied to valid ones.
 *
 */
function AssignGridCellConnections(grid, grid_size_x, grid_size_y, cursor_x, cursor_y, floor_props) {
  //Draw a random connection direction.
  //Connect the current cell with the cell to the:
  //	0: east
  // 	1: north
  //	2: west
  // 	3: south
  var direction = dungeonRand.RandInt(4);
  //Try to connect the current cell to another grid cell, repeat based on floor_connectivity
  for (var i = 0; i < floor_props.floor_connectivity; i++) {
    // Keep moving in the same direction with probability 1/2 ("momentum" to connect in a straight line)
    //Less forks and less doubling back
    var test = dungeonRand.RandInt(8);
    var new_direction = dungeonRand.RandInt(4);
    if (test < 4) {
      //Shuffle to a new direction
      direction = new_direction;
    }
    //Make sure our direction isn't going into a border
    //If so, rotate counterclockwise
    var ok = false;
    while (!ok) {
      switch (direction) {
        case CardinalDirection.DIR_RIGHT:
          ok = cursor_x < grid_size_x - 1;
          break;
        case CardinalDirection.DIR_UP:
          ok = cursor_y > 0;
          break;
        case CardinalDirection.DIR_LEFT:
          ok = cursor_x > 0;
          break;
        case CardinalDirection.DIR_DOWN:
          ok = cursor_y < grid_size_y - 1;
          break;
      }
      if (!ok) {
        //turn counter-clockwise
        direction = (direction + 1) % 4;
      }
    }
    //Set the connection, then move in that direction
    if (direction === CardinalDirection.DIR_RIGHT && !grid[cursor_x + 1][cursor_y].is_invalid) {
      grid[cursor_x][cursor_y].connected_to_right = true;
      grid[cursor_x + 1][cursor_y].connected_to_left = true;
      cursor_x++;
    } else if (direction === CardinalDirection.DIR_UP && !grid[cursor_x][cursor_y - 1].is_invalid) {
      grid[cursor_x][cursor_y].connected_to_top = true;
      grid[cursor_x][cursor_y - 1].connected_to_bottom = true;
      cursor_y--;
    } else if (direction === CardinalDirection.DIR_LEFT && !grid[cursor_x - 1][cursor_y].is_invalid) {
      grid[cursor_x][cursor_y].connected_to_left = true;
      grid[cursor_x - 1][cursor_y].connected_to_right = true;
      cursor_x--;
    } else if (direction === CardinalDirection.DIR_DOWN && !grid[cursor_x][cursor_y + 1].is_invalid) {
      grid[cursor_x][cursor_y].connected_to_bottom = true;
      grid[cursor_x][cursor_y + 1].connected_to_top = true;
      cursor_y++;
    }
  }
  // No dead ends, add some extra connections!
  if (!floor_props.allow_dead_ends) {
    var more = true;
    while (more) {
      more = false;
      //Locate potential dead ends
      for (var y = 0; y < grid_size_y; y++) {
        for (var x = 0; x < grid_size_x; x++) {
          if (!grid[x][y].is_invalid && !grid[x][y].is_room) {
            //Find which directions this tile is connected in
            var count_connect = 0;
            if (grid[x][y].connected_to_top) count_connect++;
            if (grid[x][y].connected_to_bottom) count_connect++;
            if (grid[x][y].connected_to_left) count_connect++;
            if (grid[x][y].connected_to_right) count_connect++;
            if (count_connect === 1) {
              //This tile has only one connection, it's a dead end
              //Connect it to a random other cell to remove the dead end
              direction = dungeonRand.RandInt(4);
              var _ok = false;
              for (var _i = 0; _i < 8; _i++) {
                if (direction === CardinalDirection.DIR_RIGHT && x < grid_size_x - 1 && !grid[x][y].connected_to_right) {
                  _ok = true;
                } else if (direction === CardinalDirection.DIR_UP && y > 0 && !grid[x][y].connected_to_top) {
                  _ok = true;
                } else if (direction === CardinalDirection.DIR_LEFT && x > 0 && !grid[x][y].connected_to_left) {
                  _ok = true;
                } else if (direction === CardinalDirection.DIR_DOWN && y < grid_size_y - 1 && !grid[x][y].connected_to_bottom) {
                  _ok = true;
                } else {
                  direction = (direction + 1) % 4;
                }
                if (_ok) break; //Once we find a successful direction, stop
              }
              //We couldn't find any successful direction, give up.
              if (!_ok) continue;
              if (advancedGenerationSettings.fix_dead_end_validation_error) {
                if (direction === CardinalDirection.DIR_RIGHT && !grid[x + 1][y].is_invalid) {
                  grid[x][y].connected_to_right = true;
                  grid[x + 1][y].connected_to_left = true;
                  //Because we've drawn a new connection, we have to
                  //iterate through everything again in case we made a new dead end
                  more = true;
                  x++;
                } else if (direction === CardinalDirection.DIR_UP && !grid[x][y - 1].is_invalid) {
                  grid[x][y].connected_to_top = true;
                  grid[x][y - 1].connected_to_bottom = true;
                  more = true;
                  y--;
                } else if (direction === CardinalDirection.DIR_LEFT && !grid[x - 1][y].is_invalid) {
                  grid[x][y].connected_to_left = true;
                  grid[x - 1][y].connected_to_right = true;
                  more = true;
                  x--;
                } else if (direction === CardinalDirection.DIR_DOWN && !grid[x][y + 1].is_invalid) {
                  grid[x][y].connected_to_bottom = true;
                  grid[x][y + 1].connected_to_top = true;
                  y++;
                }
              }
              //This section retains the original functionality
              else {
                if (direction === CardinalDirection.DIR_RIGHT && !grid[x + 1][y].is_invalid) {
                  grid[x][y].connected_to_right = true;
                  grid[x + 1][y].connected_to_left = true;
                  more = true;
                  x++;
                }
                //BUG: the wrong grid index is used for the validity check
                else if (direction === CardinalDirection.DIR_UP && !grid[x + 1][y].is_invalid) {
                  grid[x][y].connected_to_top = true;
                  grid[x][y - 1].connected_to_bottom = true;
                  more = true;
                  y--;
                }
                //BUG: the wrong grid index is used for the validity check
                else if (direction === CardinalDirection.DIR_LEFT && !grid[x + 1][y].is_invalid) {
                  grid[x][y].connected_to_left = true;
                  grid[x - 1][y].connected_to_right = true;
                  more = true;
                  x--;
                }
                //BUG: the wrong grid index is used for the validity check
                else if (direction === CardinalDirection.DIR_DOWN && !grid[x + 1][y].is_invalid) {
                  grid[x][y].connected_to_bottom = true;
                  grid[x][y + 1].connected_to_top = true;
                  y++;
                }
              }
            }
          }
        }
      }
    }
  }
}
/**
 * NA: 0233F120
 * CreateHallway - Creates a hallway between two points.
 *
 *        |---------B
 *        |
 * A------|
 *
 * The hallway generated consists of two parallel paths connected by a perpendicular "kink" in the path
 * The "kink" in a path occurs along (turn_x, turn_y), which in practice is the grid cell boundary
 * If the paths trace same line, no "kink" will be generated
 *
 * If generation runs into an existing open tile, creation stops prematurely (such as another hallway).
 *
 * The vertical flag specifies whether the hallway is being generated horizontally or vertically
 */
function CreateHallway(start_x, start_y, end_x, end_y, vertical, turn_x, turn_y) {
  var cur_x = start_x;
  var cur_y = start_y;
  var counter = 0;
  if (!vertical) {
    //Horizontal hallway
    // Create the horizontal line between the starting point and the grid cell boundary
    while (cur_x !== turn_x) {
      if (counter >= 56) return; //Sanity check!
      counter++;
      if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        //If we find open floor, stop here
        //The hall has connected up to an existing hall
        if (start_x !== cur_x) return;
      } else {
        dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
      }
      if (cur_x >= turn_x) {
        cur_x--;
      } else {
        cur_x++;
      }
    }
    counter = 0;
    //Create the vertical line to connect the horizontal lines at two different y values
    while (cur_y !== end_y) {
      if (counter >= 56) return;
      counter++;
      if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        //If we find open floor, stop here
        //The hall has connected up to an existing hall
        if (start_x !== cur_x || start_y !== cur_y) return;
      } else {
        dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
      }
      if (cur_y >= end_y) {
        cur_y--;
      } else {
        cur_y++;
      }
    }
    counter = 0;
    //Create the horizontal line between the end point and the grid cell
    while (cur_x !== end_x) {
      if (counter >= 56) return;
      counter++;
      if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        //If we find open floor, stop here
        //The hall has connected up to an existing hall
        if (start_x !== cur_x || start_y !== cur_y) return;
      } else {
        dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
      }
      if (cur_x >= end_x) {
        cur_x--;
      } else {
        cur_x++;
      }
    }
  } else {
    //Vertical hallway
    // Create the vertical line between the starting point and the grid cell boundary
    while (cur_y !== turn_y) {
      if (counter >= 56) return; //Sanity check!
      counter++;
      if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        //If we find open floor, stop here
        //The hall has connected up to an existing hall
        if (start_y !== cur_y) return;
      } else {
        dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
      }
      if (cur_y >= turn_y) {
        cur_y--;
      } else {
        cur_y++;
      }
    }
    counter = 0;
    //Create the horizontal line to connect the horizontal lines at two different x values
    while (cur_x !== end_x) {
      if (counter >= 56) return;
      counter++;
      if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        //If we find open floor, stop here
        //The hall has connected up to an existing hall
        if (start_x !== cur_x || start_y !== cur_y) return;
      } else {
        dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
      }
      if (cur_x >= end_x) {
        cur_x--;
      } else {
        cur_x++;
      }
    }
    counter = 0;
    //Create the vertical line between the end point and the grid cell
    while (cur_y !== end_y) {
      if (counter >= 56) return;
      counter++;
      if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        //If we find open floor, stop here
        //The hall has connected up to an existing hall
        if (start_x !== cur_x || start_y !== cur_y) return;
      } else {
        dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
      }
      if (cur_y >= end_y) {
        cur_y--;
      } else {
        cur_y++;
      }
    }
  }
}
/**
 * NA: 0233E43C
 * CreateGridCellConnections - Creates connections through generating hallways and merging rooms
 *
 * First, connection links are copied over to a work array for managing hallway generation.
 *
 * Then, for each connection specified between two cells, a hallway is generated based on the following:
 * 	- If the cell is a hallway anchor, the hallway is generated based on the exact point of the anchor tile
 * 	- If the cell is a room, the hallway is generated based on a random interior point inside the room
 *
 * See: CreateHallway for how these points generate the hallway path
 *
 * Finally, if room merging is enabled there is a 9.75% chance that two connected rooms will be merged
 * into a single larger room. (9.75% comes from two 5% rolls, one for each of the two rooms being merged)
 * A room can only participate in a merge once.
 *
 * Merged rooms take up the full tile space occuipied between the two rooms.
 *
 */
function CreateGridCellConnections(grid, grid_size_x, grid_size_y, list_x, list_y, disable_room_merging) {
  //Validate and copy grid connections over to a work array
  for (var y = 0; y < grid_size_y; y++) {
    for (var x = 0; x < grid_size_x; x++) {
      if (!grid[x][y].is_invalid) {
        //For valid cells, remove cell connections beyond the grid bounds
        if (x === 0) {
          grid[x][y].connected_to_left = false;
        }
        if (y === 0) {
          grid[x][y].connected_to_top = false;
        }
        if (x === grid_size_x - 1) {
          grid[x][y].connected_to_right = false;
        }
        if (y === grid_size_y - 1) {
          grid[x][y].connected_to_bottom = false;
        }
        //Assign the connections
        grid[x][y].should_connect_to_top = grid[x][y].connected_to_top;
        grid[x][y].should_connect_to_bottom = grid[x][y].connected_to_bottom;
        grid[x][y].should_connect_to_left = grid[x][y].connected_to_left;
        grid[x][y].should_connect_to_right = grid[x][y].connected_to_right;
      } else {
        //For invalid cells, assign no connections
        grid[x][y].should_connect_to_top = false;
        grid[x][y].should_connect_to_bottom = false;
        grid[x][y].should_connect_to_left = false;
        grid[x][y].should_connect_to_right = false;
      }
    }
  }
  for (var _x5 = 0; _x5 < grid_size_x; _x5++) {
    for (var _y4 = 0; _y4 < grid_size_y; _y4++) {
      if (grid[_x5][_y4].is_invalid) continue;
      var pt_x = void 0,
        pt_y = void 0,
        pt2_x = void 0,
        pt2_y = void 0;
      if (!grid[_x5][_y4].is_room) {
        //Hallway anchor, point is the 1x1 we've placed
        pt_x = grid[_x5][_y4].start_x;
        pt_y = grid[_x5][_y4].start_y;
      } else {
        //Room, pick a random point in the interior of the room
        pt_x = dungeonRand.RandRange(grid[_x5][_y4].start_x + 1, grid[_x5][_y4].end_x - 1);
        pt_y = dungeonRand.RandRange(grid[_x5][_y4].start_y + 1, grid[_x5][_y4].end_y - 1);
      }
      if (grid[_x5][_y4].should_connect_to_top) {
        //Connect to the cell above
        if (!grid[_x5][_y4 - 1].is_invalid) {
          if (!grid[_x5][_y4 - 1].is_room) {
            //Anchor, use the central x coordinate
            pt2_x = grid[_x5][_y4 - 1].start_x;
          } else {
            //Room, pick a random interior x coordinate
            pt2_x = dungeonRand.RandRange(grid[_x5][_y4 - 1].start_x + 1, grid[_x5][_y4 - 1].end_x - 1);
          }
          //Create the hallway
          CreateHallway(pt_x, grid[_x5][_y4].start_y, pt2_x, grid[_x5][_y4 - 1].end_y - 1, true, list_x[_x5], list_y[_y4]);
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_HALLWAY);
        }
        //Mark the connection and unassign it so we don't try to draw
        //a second connection from the other way
        grid[_x5][_y4].should_connect_to_top = false;
        grid[_x5][_y4 - 1].should_connect_to_bottom = false;
        grid[_x5][_y4].is_connected = true;
        grid[_x5][_y4 - 1].is_connected = true;
      }
      if (grid[_x5][_y4].should_connect_to_bottom) {
        //Connect to the cell below
        if (!grid[_x5][_y4 + 1].is_invalid) {
          if (!grid[_x5][_y4 + 1].is_room) {
            //Anchor, use the central x coordinate
            pt2_x = grid[_x5][_y4 + 1].start_x;
          } else {
            //Room, pick a random interior x coordinate
            pt2_x = dungeonRand.RandRange(grid[_x5][_y4 + 1].start_x + 1, grid[_x5][_y4 + 1].end_x - 1);
          }
          //Create the hallway
          CreateHallway(pt_x, grid[_x5][_y4].end_y - 1, pt2_x, grid[_x5][_y4 + 1].start_y, true, list_x[_x5], list_y[_y4 + 1] - 1);
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_HALLWAY);
        }
        //Mark the connection and unassign it so we don't try to draw
        //a second connection from the other way
        grid[_x5][_y4].should_connect_to_bottom = false;
        grid[_x5][_y4 + 1].should_connect_to_top = false;
        grid[_x5][_y4].is_connected = true;
        grid[_x5][_y4 + 1].is_connected = true;
      }
      if (grid[_x5][_y4].should_connect_to_left) {
        //Connect to the cell on the left
        if (!grid[_x5 - 1][_y4].is_invalid) {
          if (!grid[_x5 - 1][_y4].is_room) {
            //Anchor, use the central y coordinate
            pt2_y = grid[_x5 - 1][_y4].start_y;
          } else {
            //Room, pick a random interior y coordinate
            pt2_y = dungeonRand.RandRange(grid[_x5 - 1][_y4].start_y + 1, grid[_x5 - 1][_y4].end_y - 1);
          }
          //Create the hallway
          //Using (grid[x-1][y].start_x - 1) is a bug, it should be (grid[x-1][y].end_x - 1)
          //But CreateHallway has safety checks making the end result the same anyways.
          CreateHallway(grid[_x5][_y4].start_x, pt_y, grid[_x5 - 1][_y4].start_x - 1, pt2_y, false, list_x[_x5], list_y[_y4]);
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_HALLWAY);
        }
        //Mark the connection and unassign it so we don't try to draw
        //a second connection from the other way
        grid[_x5][_y4].should_connect_to_left = false;
        grid[_x5 - 1][_y4].should_connect_to_right = false;
        grid[_x5][_y4].is_connected = true;
        grid[_x5 - 1][_y4].is_connected = true;
      }
      if (grid[_x5][_y4].should_connect_to_right) {
        //Connect to the cell on the right
        if (!grid[_x5 + 1][_y4].is_invalid) {
          if (!grid[_x5 + 1][_y4].is_room) {
            //Anchor, use the central y coordinate
            pt2_y = grid[_x5 + 1][_y4].start_y;
          } else {
            //Room, pick a random interior y coordinate
            pt2_y = dungeonRand.RandRange(grid[_x5 + 1][_y4].start_y + 1, grid[_x5 + 1][_y4].end_y - 1);
          }
          //Create the hallway
          CreateHallway(grid[_x5][_y4].end_x - 1, pt_y, grid[_x5 + 1][_y4].start_x, pt2_y, false, list_x[_x5 + 1] - 1, list_y[_y4]);
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_HALLWAY);
        }
        //Mark the connection and unassign it so we don't try to draw
        //a second connection from the other way
        grid[_x5][_y4].should_connect_to_right = false;
        grid[_x5 + 1][_y4].should_connect_to_left = false;
        grid[_x5][_y4].is_connected = true;
        grid[_x5 + 1][_y4].is_connected = true;
      }
    }
  }
  //If we don't want to merge rooms, we're done
  if (disable_room_merging) {
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_CREATE_GRID_CELL_CONNECTIONS);
    return;
  }
  //If we do, we can try to merge some!
  for (var _x6 = 0; _x6 < grid_size_x; _x6++) {
    for (var _y5 = 0; _y5 < grid_size_y; _y5++) {
      var chance = dungeonRand.RandInt(100);
      var src_x = void 0,
        src_y = void 0,
        dst_x = void 0,
        dst_y = void 0,
        merge_room_index = void 0;
      // Conditions for merging a room:
      // - rolls for merge chance
      // - valid
      // - connected to another room
      // - not already merged
      // - not have a secondary structure
      // - is a room, not an anchor
      if (chance < generationConstants.merge_rooms_chance && !grid[_x6][_y5].is_invalid && grid[_x6][_y5].is_connected && !grid[_x6][_y5].is_merged && !grid[_x6][_y5].has_secondary_structure && grid[_x6][_y5].is_room) {
        var chance_two = dungeonRand.RandInt(4);
        //Verify the same for the target room
        if (chance_two === 0 && _x6 >= 1 && !grid[_x6 - 1][_y5].is_invalid && grid[_x6 - 1][_y5].is_connected && !grid[_x6 - 1][_y5].is_merged && !grid[_x6 - 1][_y5].has_secondary_structure && grid[_x6 - 1][_y5].is_room) {
          //Merge with the room to the left
          src_y = Math.min(grid[_x6 - 1][_y5].start_y, grid[_x6][_y5].start_y);
          dst_y = Math.max(grid[_x6 - 1][_y5].end_y, grid[_x6][_y5].end_y);
          src_x = grid[_x6 - 1][_y5].start_x;
          dst_x = grid[_x6][_y5].end_x;
          //Use the original room's index
          merge_room_index = dungeonData.list_tiles[grid[_x6][_y5].start_x][grid[_x6][_y5].start_y].room_index;
          //Carve out the merged room
          for (var cur_x = src_x; cur_x < dst_x; cur_x++) {
            for (var cur_y = src_y; cur_y < dst_y; cur_y++) {
              dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
              dungeonData.list_tiles[cur_x][cur_y].room_index = merge_room_index;
            }
          }
          //Update room boundaries
          grid[_x6 - 1][_y5].start_x = src_x;
          grid[_x6 - 1][_y5].start_y = src_y;
          grid[_x6 - 1][_y5].end_x = dst_x;
          grid[_x6 - 1][_y5].end_y = dst_y;
          //Mark merge flags on both rooms
          grid[_x6 - 1][_y5].is_merged = true;
          grid[_x6][_y5].is_merged = true;
          grid[_x6][_y5].is_connected = false;
          grid[_x6][_y5].has_been_merged = true;
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_MERGE_ROOM);
        } else if (chance_two === 1 && _y5 >= 1 && !grid[_x6][_y5 - 1].is_invalid && grid[_x6][_y5 - 1].is_connected && !grid[_x6][_y5 - 1].is_merged && !grid[_x6][_y5 - 1].has_secondary_structure && grid[_x6][_y5 - 1].is_room) {
          //Merge with the room above
          src_x = Math.min(grid[_x6][_y5 - 1].start_x, grid[_x6][_y5].start_x);
          dst_x = Math.max(grid[_x6][_y5 - 1].end_x, grid[_x6][_y5].end_x);
          src_y = grid[_x6][_y5 - 1].start_y;
          dst_y = grid[_x6][_y5].end_y;
          //Use the original room's index
          merge_room_index = dungeonData.list_tiles[grid[_x6][_y5].start_x][grid[_x6][_y5].start_y].room_index;
          //Carve out the merged room
          for (var _cur_x = src_x; _cur_x < dst_x; _cur_x++) {
            for (var _cur_y = src_y; _cur_y < dst_y; _cur_y++) {
              dungeonData.list_tiles[_cur_x][_cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
              dungeonData.list_tiles[_cur_x][_cur_y].room_index = merge_room_index;
            }
          }
          //Update room boundaries
          grid[_x6][_y5 - 1].start_x = src_x;
          grid[_x6][_y5 - 1].start_y = src_y;
          grid[_x6][_y5 - 1].end_x = dst_x;
          grid[_x6][_y5 - 1].end_y = dst_y;
          //Mark merge flags on both rooms
          grid[_x6][_y5 - 1].is_merged = true;
          grid[_x6][_y5].is_merged = true;
          grid[_x6][_y5].is_connected = false;
          grid[_x6][_y5].has_been_merged = true;
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_MERGE_ROOM);
        } else if (chance_two === 2 && _x6 <= grid_size_x - 2 && !grid[_x6 + 1][_y5].is_invalid && grid[_x6 + 1][_y5].is_connected && !grid[_x6 + 1][_y5].is_merged && !grid[_x6 + 1][_y5].has_secondary_structure && grid[_x6 + 1][_y5].is_room) {
          //Merge with the room to the right
          src_y = Math.min(grid[_x6 + 1][_y5].start_y, grid[_x6][_y5].start_y);
          dst_y = Math.max(grid[_x6 + 1][_y5].end_y, grid[_x6][_y5].end_y);
          src_x = grid[_x6][_y5].start_x;
          dst_x = grid[_x6 + 1][_y5].end_x;
          //Use the original room's index
          merge_room_index = dungeonData.list_tiles[grid[_x6][_y5].start_x][grid[_x6][_y5].start_y].room_index;
          //Carve out the merged room
          for (var _cur_x2 = src_x; _cur_x2 < dst_x; _cur_x2++) {
            for (var _cur_y2 = src_y; _cur_y2 < dst_y; _cur_y2++) {
              dungeonData.list_tiles[_cur_x2][_cur_y2].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
              dungeonData.list_tiles[_cur_x2][_cur_y2].room_index = merge_room_index;
            }
          }
          //Update room boundaries
          grid[_x6 + 1][_y5].start_x = src_x;
          grid[_x6 + 1][_y5].start_y = src_y;
          grid[_x6 + 1][_y5].end_x = dst_x;
          grid[_x6 + 1][_y5].end_y = dst_y;
          //Mark merge flags on both rooms
          grid[_x6 + 1][_y5].is_merged = true;
          grid[_x6][_y5].is_merged = true;
          grid[_x6][_y5].is_connected = false;
          grid[_x6][_y5].has_been_merged = true;
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_MERGE_ROOM);
        } else if (chance_two === 3 && _y5 <= grid_size_y - 2 && !grid[_x6][_y5 + 1].is_invalid && grid[_x6][_y5 + 1].is_connected && !grid[_x6][_y5 + 1].is_merged && !grid[_x6][_y5 + 1].has_secondary_structure && grid[_x6][_y5 + 1].is_room) {
          //Merge with the room below
          src_x = Math.min(grid[_x6][_y5 + 1].start_x, grid[_x6][_y5].start_x);
          dst_x = Math.max(grid[_x6][_y5 + 1].end_x, grid[_x6][_y5].end_x);
          src_y = grid[_x6][_y5].start_y;
          dst_y = grid[_x6][_y5 + 1].end_y;
          //Use the original room's index
          merge_room_index = dungeonData.list_tiles[grid[_x6][_y5].start_x][grid[_x6][_y5].start_y].room_index;
          //Carve out the merged room
          for (var _cur_x3 = src_x; _cur_x3 < dst_x; _cur_x3++) {
            for (var _cur_y3 = src_y; _cur_y3 < dst_y; _cur_y3++) {
              dungeonData.list_tiles[_cur_x3][_cur_y3].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
              dungeonData.list_tiles[_cur_x3][_cur_y3].room_index = merge_room_index;
            }
          }
          //Update room boundaries
          grid[_x6][_y5 + 1].start_x = src_x;
          grid[_x6][_y5 + 1].start_y = src_y;
          grid[_x6][_y5 + 1].end_x = dst_x;
          grid[_x6][_y5 + 1].end_y = dst_y;
          //Mark merge flags on both rooms
          grid[_x6][_y5 + 1].is_merged = true;
          grid[_x6][_y5].is_merged = true;
          grid[_x6][_y5].is_connected = false;
          grid[_x6][_y5].has_been_merged = true;
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_MERGE_ROOM);
        }
      }
    }
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_CREATE_GRID_CELL_CONNECTIONS);
}
/**
 * NA: 0233F424
 * EnsureConnectedGrid - Ensure the grid forms a connected graph (all valid cells are reachable) by adding hallways to unreachable cells
 *
 * If the unconnected cell is a hallway anchor, it will be ignored and filled in.
 * If the unconnected cell is a room, it will check all adjacent directions for a connected room, then add a hallway between if found.
 *
 * If no eligible room is found, the room will be removed and filled back in.
 */
function EnsureConnectedGrid(grid, grid_size_x, grid_size_y, list_x, list_y) {
  //Flag for OnCompleteGenerationStep to verify if any changes were actually made
  var was_grid_changed = false;
  for (var x = 0; x < grid_size_x; x++) {
    for (var y = 0; y < grid_size_y; y++) {
      //If any of these is true, this cell is fine and we don't need to worry about it
      if (grid[x][y].is_invalid || grid[x][y].is_connected || grid[x][y].has_been_merged) continue;
      var rnd_x = void 0,
        rnd_y = void 0,
        pt_x = void 0,
        pt_y = void 0;
      if (grid[x][y].is_room && !grid[x][y].has_secondary_structure) {
        //Unconnected room
        rnd_x = dungeonRand.RandRange(grid[x][y].start_x + 1, grid[x][y].end_x - 1);
        rnd_y = dungeonRand.RandRange(grid[x][y].start_y + 1, grid[x][y].end_y - 1);
        if (y > 0 && !grid[x][y - 1].is_invalid && !grid[x][y - 1].is_merged && grid[x][y - 1].is_connected) {
          //Attempt to connect to the grid cell above if it's connected
          if (!grid[x][y - 1].is_room) {
            //Anchor, take center x
            pt_x = grid[x][y - 1].start_x;
          } else {
            //Room, take random interior x coordinate
            pt_x = dungeonRand.RandRange(grid[x][y - 1].start_x + 1, grid[x][y - 1].end_x - 1);
            pt_y = dungeonRand.RandRange(grid[x][y - 1].start_y + 1, grid[x][y - 1].end_y - 1); //Unused
          }

          CreateHallway(rnd_x, grid[x][y].start_y, pt_x, grid[x][y - 1].end_y - 1, true, list_x[x], list_y[y]);
          grid[x][y].is_connected = true;
          grid[x][y].connected_to_top = true;
          grid[x][y - 1].connected_to_bottom = true;
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_ENSURE_CONNECTED_HALLWAY);
          was_grid_changed = true;
        } else if (y < grid_size_y - 1 && !grid[x][y + 1].is_invalid && !grid[x][y + 1].is_merged && grid[x][y + 1].is_connected) {
          //Attempt to connect to the grid cell below if it's connected
          if (!grid[x][y + 1].is_room) {
            //Anchor, take center x
            pt_x = grid[x][y + 1].start_x;
          } else {
            //Room, take random interior x coordinate
            pt_x = dungeonRand.RandRange(grid[x][y + 1].start_x + 1, grid[x][y + 1].end_x - 1);
            pt_y = dungeonRand.RandRange(grid[x][y + 1].start_y + 1, grid[x][y + 1].end_y - 1); //Unused
          }

          CreateHallway(rnd_x, grid[x][y].end_y - 1, pt_x, grid[x][y + 1].start_y, true, list_x[x], list_y[y + 1] - 1);
          grid[x][y].is_connected = true;
          grid[x][y].connected_to_bottom = true;
          grid[x][y + 1].connected_to_top = true;
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_ENSURE_CONNECTED_HALLWAY);
          was_grid_changed = true;
        } else if (x > 0 && !grid[x - 1][y].is_invalid && !grid[x - 1][y].is_merged && grid[x - 1][y].is_connected) {
          //Attempt to connect to the grid cell left if it's connected
          if (!grid[x - 1][y].is_room) {
            //Anchor, take center y
            pt_y = grid[x - 1][y].start_y;
          } else {
            //Room, take random interior y coordinate
            pt_x = dungeonRand.RandRange(grid[x - 1][y].start_x + 1, grid[x - 1][y].end_x - 1); //Unused
            pt_y = dungeonRand.RandRange(grid[x - 1][y].start_y + 1, grid[x - 1][y].end_y - 1);
          }
          // Typo? Would expect grid[x - 1][y].end_x - 1 for 3rd parameter
          CreateHallway(grid[x][y].start_x, rnd_y, grid[x - 1][y].start_x - 1, pt_y, false, list_x[x], list_y[y]);
          grid[x][y].is_connected = true;
          grid[x][y].connected_to_left = true;
          grid[x - 1][y].connected_to_right = true;
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_ENSURE_CONNECTED_HALLWAY);
          was_grid_changed = true;
        } else if (x < grid_size_x - 1 && !grid[x + 1][y].is_invalid && !grid[x + 1][y].is_merged && grid[x + 1][y].is_connected) {
          //Attempt to connect to the grid cell right if it's connected
          if (!grid[x + 1][y].is_room) {
            //Anchor, take center y
            pt_y = grid[x + 1][y].start_y;
          } else {
            //Room, take random interior y coordinate
            pt_x = dungeonRand.RandRange(grid[x + 1][y].start_x + 1, grid[x + 1][y].end_x - 1); //Unused
            pt_y = dungeonRand.RandRange(grid[x + 1][y].start_y + 1, grid[x + 1][y].end_y - 1);
          }
          CreateHallway(grid[x][y].end_x - 1, rnd_y, grid[x + 1][y].start_x, pt_y, false, list_x[x + 1] - 1, list_y[y]);
          grid[x][y].is_connected = true;
          grid[x][y].connected_to_right = true;
          grid[x + 1][y].connected_to_left = true;
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_ENSURE_CONNECTED_HALLWAY);
          was_grid_changed = true;
        }
      } else {
        //Unconnected anchor, don't bother trying.
        //Just fill it in with wall tiles
        dungeonData.list_tiles[grid[x][y].start_x][grid[x][y].start_y].terrain_flags.terrain_type = TerrainType.TERRAIN_WALL;
        //Also remove any spawn flags
        dungeonData.list_tiles[grid[x][y].start_x][grid[x][y].start_y].spawn_or_visibility_flags.f_stairs = false;
        dungeonData.list_tiles[grid[x][y].start_x][grid[x][y].start_y].spawn_or_visibility_flags.f_item = false;
        dungeonData.list_tiles[grid[x][y].start_x][grid[x][y].start_y].spawn_or_visibility_flags.f_trap = false;
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_REMOVE_UNCONNECTED_ANCHOR);
        was_grid_changed = true;
      }
    }
  }
  // If any rooms are still unconnected (meaning attempts to connect failed)
  // Fill in the rooms
  for (var _x7 = 0; _x7 < grid_size_x; _x7++) {
    for (var _y6 = 0; _y6 < grid_size_y; _y6++) {
      if (grid[_x7][_y6].is_invalid || grid[_x7][_y6].has_been_merged || grid[_x7][_y6].is_connected || grid[_x7][_y6].unk4) continue;
      for (var cur_x = grid[_x7][_y6].start_x; cur_x < grid[_x7][_y6].end_x; cur_x++) {
        for (var cur_y = grid[_x7][_y6].start_y; cur_y < grid[_x7][_y6].end_y; cur_y++) {
          //Set it to wall terrain
          dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_WALL;
          //Remove any spawn flags
          dungeonData.list_tiles[cur_x][cur_y].spawn_or_visibility_flags.f_stairs = false;
          dungeonData.list_tiles[cur_x][cur_y].spawn_or_visibility_flags.f_item = false;
          dungeonData.list_tiles[cur_x][cur_y].spawn_or_visibility_flags.f_trap = false;
          //Set room index to 0xFF (not a room)
          dungeonData.list_tiles[cur_x][cur_y].room_index = 0xff;
          if (grid[_x7][_y6].is_room) {
            was_grid_changed = true;
          }
        }
      }
      //Technicially this part of the function doesn't consider whether the grid cell is actually a room at all
      //(If it's an anchor, nothing visibly changes besides the loss of room index)
      if (grid[_x7][_y6].is_room) {
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_REMOVE_UNCONNECTED_ROOM);
      }
    }
  }
  if (was_grid_changed) {
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_ENSURE_CONNECTED_GRID);
  }
}
/**
 * NA: 0233F900
 * SetTerrainObstacleChecked - Sets terrain on a specific tile as an obstacle (either a wall or secondary terrain)
 *
 * If secondary terrain is requested and the room indices match, secondary terrain (water/lava) will be placed for the tile.
 *
 * Otherwise, the tile will be a wall.
 */
function SetTerrainObstacleChecked(tile, use_secondary_terrain, room_index) {
  if (use_secondary_terrain && tile.room_index === room_index) {
    tile.terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
  } else {
    tile.terrain_flags.terrain_type = TerrainType.TERRAIN_WALL;
  }
}
/**
 * NA: 023406D4
 * GenerateMazeLine - Generates a "maze line" from the given start point, within the given bounds.
 *
 * A "maze line" is a random walk starting from (x0, y0). The random walk moves in strides of 2
 * in a random direction, placing down obstacles as it goes.
 *
 * The walk will terminate when the random walk has no available open tiles it can walk to.
 *
 *  [ ^ ] [   ] [   ]      	[ o ] [ - ] [ > ]
 *  [ | ] [   ] [   ]   =>	[ W ] [   ] [   ]  => etc.
 *  [ o ] [   ] [ W ]		[ W ] [   ] [ W ]
 *
 * First, an obstacle is placed at the given position (see: SetTerrainObstacleChecked)
 *
 * Then, a random direction is selected, searching for an open tile distance 2 away from (x0, y0).
 * Each direction is attempted rotating counter-clockwise until an open tile is found or all directions are exhausted.
 *
 * If an open tile is found, an obstacle is placed between the two tiles, and (x0, y0) moves to the new open tile.
 * This process continues until no valid open tile can be found.
 */
function GenerateMazeLine(x0, y0, xmin, ymin, xmax, ymax, use_secondary_terrain, room_index) {
  var ok = true;
  while (ok) {
    var direction = dungeonRand.RandInt(4);
    SetTerrainObstacleChecked(dungeonData.list_tiles[x0][y0], use_secondary_terrain, room_index);
    ok = false;
    for (var i = 0; i < 4; i++) {
      var offset_x = 0,
        offset_y = 0;
      //Offset from our current position to look 2 tiles in a given direction
      if (direction === CardinalDirection.DIR_RIGHT) {
        offset_x = 2;
        offset_y = 0;
      } else if (direction === CardinalDirection.DIR_UP) {
        offset_x = 0;
        offset_y = -2;
      } else if (direction === CardinalDirection.DIR_LEFT) {
        offset_x = -2;
        offset_y = 0;
      } else if (direction === CardinalDirection.DIR_DOWN) {
        offset_x = 0;
        offset_y = 2;
      }
      var pos_x = x0 + offset_x;
      var pos_y = y0 + offset_y;
      //Check that this position is in-bounds
      if (pos_x >= xmin && pos_x < xmax && pos_y >= ymin && pos_y < ymax) {
        //Check that this tile is open ground
        if (dungeonData.list_tiles[pos_x][pos_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
          //We found open ground, we're done!
          ok = true;
          break;
        }
      }
      //We didn't find any, try a different direction
      direction = (direction + 1) % 4;
    }
    //If we found some open terrain, set an obstacle for the terrain in between those two,
    //then move to the open terrain we found.
    if (ok) {
      if (direction === CardinalDirection.DIR_RIGHT) {
        SetTerrainObstacleChecked(dungeonData.list_tiles[x0 + 1][y0], use_secondary_terrain, room_index);
        x0 += 2;
      } else if (direction === CardinalDirection.DIR_UP) {
        SetTerrainObstacleChecked(dungeonData.list_tiles[x0][y0 - 1], use_secondary_terrain, room_index);
        y0 -= 2;
      } else if (direction === CardinalDirection.DIR_LEFT) {
        SetTerrainObstacleChecked(dungeonData.list_tiles[x0 - 1][y0], use_secondary_terrain, room_index);
        x0 -= 2;
      } else if (direction === CardinalDirection.DIR_DOWN) {
        SetTerrainObstacleChecked(dungeonData.list_tiles[x0][y0 + 1], use_secondary_terrain, room_index);
        y0 += 2;
      }
    }
  }
}
/**
 * NA: 02340458
 * GenerateMaze - Generate a maze room within the given grid cell.
 *
 * A "maze" is generated using a series of random walks whiich place obstacle terrain (walls / secondary terrain)
 * in a maze-like arrangement. "Maze lines" (see: GenerateMazeLine) are generated using every other tile around the
 * room's border, and every other interior tile as a starting point, ensuring there are stripes of walkable open terrain
 * surrounded by striples of obstacles (maze walls).
 *
 */
function GenerateMaze(grid_cell, use_secondary_terrain) {
  grid_cell.is_maze_room = true;
  statusData.has_maze = true;
  var room_index = dungeonData.list_tiles[grid_cell.start_x][grid_cell.start_y].room_index;
  // Random walks from upper border
  for (var cur_x = grid_cell.start_x + 1; cur_x < grid_cell.end_x - 1; cur_x += 2) {
    if (dungeonData.list_tiles[cur_x][grid_cell.start_y - 1].terrain_flags.terrain_type !== TerrainType.TERRAIN_NORMAL) {
      GenerateMazeLine(cur_x, grid_cell.start_y - 1, grid_cell.start_x, grid_cell.start_y, grid_cell.end_x, grid_cell.end_y, use_secondary_terrain, room_index);
    }
  }
  // Random walks from right border
  for (var cur_y = grid_cell.start_y + 1; cur_y < grid_cell.end_y - 1; cur_y += 2) {
    if (dungeonData.list_tiles[grid_cell.end_x][cur_y].terrain_flags.terrain_type !== TerrainType.TERRAIN_NORMAL) {
      GenerateMazeLine(grid_cell.end_x, cur_y, grid_cell.start_x, grid_cell.start_y, grid_cell.end_x, grid_cell.end_y, use_secondary_terrain, room_index);
    }
  }
  // Random walks from lower border
  for (var _cur_x4 = grid_cell.start_x + 1; _cur_x4 < grid_cell.end_x - 1; _cur_x4 += 2) {
    if (dungeonData.list_tiles[_cur_x4][grid_cell.end_y].terrain_flags.terrain_type !== TerrainType.TERRAIN_NORMAL) {
      GenerateMazeLine(_cur_x4, grid_cell.end_y, grid_cell.start_x, grid_cell.start_y, grid_cell.end_x, grid_cell.end_y, use_secondary_terrain, room_index);
    }
  }
  // Random walks from left border
  for (var _cur_y4 = grid_cell.start_y + 1; _cur_y4 < grid_cell.end_y - 1; _cur_y4 += 2) {
    if (dungeonData.list_tiles[grid_cell.start_x - 1][_cur_y4].terrain_flags.terrain_type !== TerrainType.TERRAIN_NORMAL) {
      GenerateMazeLine(grid_cell.start_x - 1, _cur_y4, grid_cell.start_x, grid_cell.start_y, grid_cell.end_x, grid_cell.end_y, use_secondary_terrain, room_index);
    }
  }
  // Fill in all the inner tiles with a stride of 2
  for (var _cur_x5 = grid_cell.start_x + 3; _cur_x5 < grid_cell.end_x - 3; _cur_x5 += 2) {
    for (var _cur_y5 = grid_cell.start_y + 3; _cur_y5 < grid_cell.end_y - 3; _cur_y5 += 2) {
      if (dungeonData.list_tiles[_cur_x5][_cur_y5].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        if (use_secondary_terrain) {
          dungeonData.list_tiles[_cur_x5][_cur_y5].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
        } else {
          dungeonData.list_tiles[_cur_x5][_cur_y5].terrain_flags.terrain_type = TerrainType.TERRAIN_WALL;
        }
        // More random walks
        GenerateMazeLine(_cur_x5, _cur_y5, grid_cell.start_x, grid_cell.start_y, grid_cell.end_x, grid_cell.end_y, use_secondary_terrain, room_index);
      }
    }
  }
}
/**
 * NA: 02340224
 * GenerateMazeRoom - Determines and calls for whether to generate a maze room on the floor.
 *
 * A maze room can be generated by the probability specified in the maze_chance parameter, usually in vanilla
 * this parameter is set to either 0 or 1, giving a 0-1% chance for trying to spawn a maze room.
 *
 * Then, a strange check occurs for whether the floor_generation_attempts is < 0, which will always fail, resulting
 * in no maze rooms ever being generated under normal conditions. A patch is provided to allow this check to go
 * through and generate a maze room if desired.
 *
 * Candidate maze rooms have to be valid, connected, have odd dimensions, and not have any other features.
 * If any candidates are found, the game will select one of these rooms and call GenerateMaze.
 */
function GenerateMazeRoom(grid, grid_size_x, grid_size_y, maze_chance) {
  if (maze_chance <= 0) return; //No chance for maze, stop
  if (dungeonRand.RandInt(100) >= maze_chance) return; //Need to roll the probability chance (which is usually 0-1%...)
  if (advancedGenerationSettings.allow_wall_maze_room_generation || dungeonGenerationInfo.floor_generation_attempts < 0) {
    // Count the number of rooms that can be mazified:
    // - Valid
    // - Not a Merged Room
    // - Connected
    // - Not a Monster House
    // - Both Dimensions are Odd
    var num_valid = 0;
    for (var y = 0; y < grid_size_y; y++) {
      for (var x = 0; x < grid_size_x; x++) {
        if (!grid[x][y].is_invalid && !grid[x][y].has_been_merged && grid[x][y].is_connected && grid[x][y].is_room && !grid[x][y].has_secondary_structure && !grid[x][y].is_kecleon_shop && !grid[x][y].is_monster_house && !grid[x][y].unk4) {
          if ((grid[x][y].end_x - grid[x][y].start_x) % 2 !== 0 && (grid[x][y].end_y - grid[x][y].start_y) % 2 !== 0) {
            num_valid++;
          }
        }
      }
    }
    if (num_valid <= 0) return;
    // Have a single 1, the rest as 0's
    var values = Array(256).fill(false);
    values[0] = true;
    //Shuffle values
    for (var i = 0; i < 64; i++) {
      var a = dungeonRand.RandInt(num_valid);
      var b = dungeonRand.RandInt(num_valid);
      var temp = values[a];
      values[a] = values[b];
      values[b] = temp;
    }
    var counter = 0;
    for (var _y7 = 0; _y7 < grid_size_y; _y7++) {
      for (var _x8 = 0; _x8 < grid_size_x; _x8++) {
        if (!grid[_x8][_y7].is_invalid && !grid[_x8][_y7].has_been_merged && grid[_x8][_y7].is_connected && grid[_x8][_y7].is_room && !grid[_x8][_y7].has_secondary_structure && !grid[_x8][_y7].is_kecleon_shop && !grid[_x8][_y7].is_monster_house && !grid[_x8][_y7].unk4) {
          if ((grid[_x8][_y7].end_x - grid[_x8][_y7].start_x) % 2 !== 0 && (grid[_x8][_y7].end_y - grid[_x8][_y7].start_y) % 2 !== 0) {
            //This room can be mazified
            if (values[counter]) {
              GenerateMaze(grid[_x8][_y7], false);
              OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_GENERATE_MAZE_ROOM);
            }
            counter++;
          }
        }
      }
    }
  }
}
/**
 * NA: 022E03B0
 * GetFloorType - Gets the current floor type.
 *
 * Floor Types:
 * 	0 - Current floor is "normal"
 * 	1 - Current floor is a fixed floor
 * 	2 - Current Floor has a rescue point
 */
function GetFloorType() {
  if (dungeonData.dungeon_objective === DungeonObjectiveType.OBJECTIVE_RESCUE && dungeonData.floor === dungeonData.rescue_floor) {
    return FloorType.FLOOR_TYPE_RESCUE;
  }
  if (dungeonGenerationInfo.fixed_room_id > 0 && dungeonGenerationInfo.fixed_room_id <= 0x6e) {
    //Fixed-floor room
    return FloorType.FLOOR_TYPE_FIXED;
  }
  return FloorType.FLOOR_TYPE_NORMAL;
}
/**
 * NA: 0233FBE8
 * GenerateKecleonShop - Potentially generate a kecleon shop on the floor.
 *
 * To spawn a kecleon shop, the floor cannot have a monster house, must not be a rescue floor, and must roll
 * the percentage chance of kecleon_chance.
 *
 * Grid cells indices are shuffled, then each is checked to meet the conditions to spawn a kecleon shop in that cell:
 * The room must be valid, connected, have no other special features, and have dimensions of at least 5x4.
 *
 * Once the first room (if any) is found that meets these conditions, the room is assigned as a kecleon shop.
 * The kecleon shop will occupy the whole room interior, with a one tile margin from the room walls.
 * Kecleon shop tiles restrict monster and stair spawns.
 */
function GenerateKecleonShop(grid, grid_size_x, grid_size_y, kecleon_chance) {
  if (statusData.has_monster_house || GetFloorType() === FloorType.FLOOR_TYPE_RESCUE || kecleon_chance <= 0) return;
  if (dungeonRand.RandInt(100) >= kecleon_chance) return;
  // All possible grid cells
  var list_x = [],
    list_y = [];
  for (var i = 0; i < 0xf; i++) {
    list_x.push(i);
    list_y.push(i);
  }
  // Shuffle x indices
  for (var x = 0; x < 200; x++) {
    var a = dungeonRand.RandInt(0xf);
    var b = dungeonRand.RandInt(0xf);
    var temp = list_x[a];
    list_x[a] = list_x[b];
    list_x[b] = temp;
  }
  // Shuffle y indices
  for (var y = 0; y < 200; y++) {
    var _a = dungeonRand.RandInt(0xf);
    var _b = dungeonRand.RandInt(0xf);
    var _temp = list_y[_a];
    list_y[_a] = list_y[_b];
    list_y[_b] = _temp;
  }
  for (var _i2 = 0; _i2 < list_x.length; _i2++) {
    if (list_x[_i2] >= grid_size_x) continue;
    var _x9 = list_x[_i2];
    for (var j = 0; j < list_y.length; j++) {
      if (list_y[j] >= grid_size_y) continue;
      var _y8 = list_y[j];
      // We've identified a random in-bounds grid cell
      // To support a kecleon shop it must be:
      // - valid
      // - not a merged room
      // - connected
      // - a room
      // - have no other special features (mazes/secondary structures)
      // - have dimensions of at least 5x4
      if (grid[_x9][_y8].is_invalid || grid[_x9][_y8].has_been_merged || grid[_x9][_y8].is_merged || !grid[_x9][_y8].is_connected || !grid[_x9][_y8].is_room || grid[_x9][_y8].has_secondary_structure || grid[_x9][_y8].is_maze_room || grid[_x9][_y8].flag_secondary_structure) continue;
      if (Math.abs(grid[_x9][_y8].start_x - grid[_x9][_y8].end_x) < 5 || Math.abs(grid[_x9][_y8].start_y - grid[_x9][_y8].end_y) < 4) continue;
      //This room can be a kecleon shop
      statusData.has_kecleon_shop = true;
      grid[_x9][_y8].is_kecleon_shop = true;
      //Make the shop span the whole room
      statusData.kecleon_shop_min_x = grid[_x9][_y8].start_x;
      statusData.kecleon_shop_min_y = grid[_x9][_y8].start_y;
      statusData.kecleon_shop_max_x = grid[_x9][_y8].end_x;
      statusData.kecleon_shop_max_y = grid[_x9][_y8].end_y;
      if (grid[_x9][_y8].end_y - grid[_x9][_y8].start_y < 3) {
        // This should never happen?
        statusData.kecleon_shop_max_y = grid[_x9][_y8].end_y + 1;
      }
      //Set to values that guarantee they'll be replaced later
      dungeonData.kecleon_shop_min_x = DEFAULT_MAX_POSITION;
      dungeonData.kecleon_shop_min_y = DEFAULT_MAX_POSITION;
      dungeonData.kecleon_shop_max_x = -DEFAULT_MAX_POSITION;
      dungeonData.kecleon_shop_max_y = -DEFAULT_MAX_POSITION;
      // Generate the actual shop on the interior, leaving
      // a 1-tile border from the room walls
      for (var cur_x = statusData.kecleon_shop_min_x + 1; cur_x < statusData.kecleon_shop_max_x - 1; cur_x++) {
        for (var cur_y = statusData.kecleon_shop_min_y + 1; cur_y < statusData.kecleon_shop_max_y - 1; cur_y++) {
          dungeonData.list_tiles[cur_x][cur_y].terrain_flags.f_in_kecleon_shop = true;
          // Restrict monsters and stairs from spawning here
          dungeonData.list_tiles[cur_x][cur_y].spawn_or_visibility_flags.f_monster = false;
          dungeonData.list_tiles[cur_x][cur_y].spawn_or_visibility_flags.f_stairs = false;
          //Ensure the borders are assigned properly
          if (cur_x <= dungeonData.kecleon_shop_min_x) {
            dungeonData.kecleon_shop_min_x = cur_x;
          }
          if (cur_y <= dungeonData.kecleon_shop_min_y) {
            dungeonData.kecleon_shop_min_y = cur_y;
          }
          if (cur_x >= dungeonData.kecleon_shop_max_x) {
            dungeonData.kecleon_shop_max_x = cur_x;
          }
          if (cur_y >= dungeonData.kecleon_shop_max_y) {
            dungeonData.kecleon_shop_max_y = cur_y;
          }
        }
      }
      //Sets an unknown spawn flag for all tiles in the room
      for (var _cur_x6 = grid[_x9][_y8].start_x; _cur_x6 < grid[_x9][_y8].end_x; _cur_x6++) {
        for (var _cur_y6 = grid[_x9][_y8].start_y; _cur_y6 < grid[_x9][_y8].end_y; _cur_y6++) {
          dungeonData.list_tiles[_cur_x6][_cur_y6].spawn_or_visibility_flags.f_special_tile = true;
        }
      }
      statusData.kecleon_shop_middle_x = Math.floor((statusData.kecleon_shop_min_x + statusData.kecleon_shop_max_x) / 2);
      statusData.kecleon_shop_middle_y = Math.floor((statusData.kecleon_shop_min_y + statusData.kecleon_shop_max_y) / 2);
      OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_GENERATE_KECLEON_SHOP);
      return;
    }
  }
}
/**
 * NA: 02349250
 * IsCurrentMissionTypeExact - Checks if the current floor is an active mission destination of the given type and subtype.
 */
function IsCurrentMissionTypeExact(type, subtype) {
  if (dungeonData.mission_destination.is_destination_floor) {
    if (dungeonData.mission_destination.mission_type === type && dungeonData.mission_destination.mission_subtype === subtype) {
      return true;
    }
  }
  return false;
}
/**
 * NA: 02349298
 * IsOutlawMonsterHouseFloor - Checks if the current floor is a mission destination for a Monster House outlaw mission.
 */
function IsOutlawMonsterHouseFloor() {
  return IsCurrentMissionTypeExact(MissionType.MISSION_ARREST_OUTLAW, MissionSubtypeOutlaw.MISSION_OUTLAW_MONSTER_HOUSE);
}
/**
 * NA: 02349748
 * FloorHasMissionMonster - Checks if a given floor is a mission destination with
 * a special monster, either a target to rescue or an enemy to defeat.
 *
 * This function traditionally accepts a mission_destination_info, but this is embedded
 * in the DungeonData class for this implementation.
 */
function FloorHasMissionMonster() {
  if (dungeonData.mission_destination.is_destination_floor) {
    if (dungeonData.mission_destination.mission_type === MissionType.MISSION_RESCUE_CLIENT || dungeonData.mission_destination.mission_type === MissionType.MISSION_RESCUE_TARGET || dungeonData.mission_destination.mission_type === MissionType.MISSION_ESCORT_TO_TARGET || dungeonData.mission_destination.mission_type === MissionType.MISSION_DELIVER_ITEM || dungeonData.mission_destination.mission_type === MissionType.MISSION_SEARCH_FOR_TARGET || dungeonData.mission_destination.mission_type === MissionType.MISSION_TAKE_ITEM_FROM_OUTLAW || dungeonData.mission_destination.mission_type === MissionType.MISSION_ARREST_OUTLAW) {
      return true;
    }
  }
  return false;
}
/**
 * NA: 0234934C
 * IsDestinationFloorWithMonster - Checks if the current floor is a mission destination floor with a special monster.
 *
 * See: FloorHasMissionMonster
 */
function IsDestinationFloorWithMonster() {
  return FloorHasMissionMonster();
}
/**
 * NA: 0233FF9C
 * GenerateMonsterHouse - Possibly generate a monster house on the floor.
 *
 * A Monster House will be generated with a probability determined by the Monster House spawn chance, and only
 * if the floor supports one (no kecleon shop, no non-MH outlaw missions, no special floor types)
 *
 * A Monster House will be generated in a random room that's valid, connected, not merged, not a maze room, and
 * is not a few unknown conditions.
 */
function GenerateMonsterHouse(grid, grid_size_x, grid_size_y, monster_house_chance) {
  // To spawn a monster house on this floor:
  // - It must meet the probability chance
  // - not have a kecleon shop
  // - Be an outlaw monster house floor or not be a special destination floor with a target
  // - Be a Normal Floor Type
  if (monster_house_chance <= 0) return;
  if (dungeonRand.RandInt(100) >= monster_house_chance) return;
  if (statusData.has_kecleon_shop) return;
  if (!IsOutlawMonsterHouseFloor() && IsDestinationFloorWithMonster() || GetFloorType() !== FloorType.FLOOR_TYPE_NORMAL) return;
  var num_valid = 0;
  for (var x = 0; x < grid_size_x; x++) {
    for (var y = 0; y < grid_size_y; y++) {
      //A grid cell can have a monster house if it:
      // - is valid
      // - is not a merged room
      // - is connected
      // - is a room
      // - is not a maze
      // - and some other unknown conditions
      if (!grid[x][y].is_invalid && !grid[x][y].has_been_merged && grid[x][y].is_connected && grid[x][y].is_room && !grid[x][y].is_kecleon_shop && !grid[x][y].unk4 && !grid[x][y].is_maze_room && !grid[x][y].has_secondary_structure) {
        num_valid++;
      }
    }
  }
  if (num_valid <= 0) return;
  // Have a single 1, the rest as 0's
  var values = Array(256).fill(false);
  values[0] = true;
  //Shuffle values
  for (var i = 0; i < 64; i++) {
    var a = dungeonRand.RandInt(num_valid);
    var b = dungeonRand.RandInt(num_valid);
    var temp = values[a];
    values[a] = values[b];
    values[b] = temp;
  }
  var counter = 0;
  for (var _x10 = 0; _x10 < grid_size_x; _x10++) {
    for (var _y9 = 0; _y9 < grid_size_y; _y9++) {
      if (!grid[_x10][_y9].is_invalid && !grid[_x10][_y9].has_been_merged && grid[_x10][_y9].is_connected && grid[_x10][_y9].is_room && !grid[_x10][_y9].is_kecleon_shop && !grid[_x10][_y9].unk4 && !grid[_x10][_y9].is_maze_room && !grid[_x10][_y9].has_secondary_structure) {
        if (values[counter]) {
          //The selected room can support a monster house
          //Generate one!
          statusData.has_monster_house = true;
          grid[_x10][_y9].is_monster_house = true;
          for (var cur_x = grid[_x10][_y9].start_x; cur_x < grid[_x10][_y9].end_x; cur_x++) {
            for (var cur_y = grid[_x10][_y9].start_y; cur_y < grid[_x10][_y9].end_y; cur_y++) {
              dungeonData.list_tiles[cur_x][cur_y].terrain_flags.f_in_monster_house = true;
              dungeonGenerationInfo.monster_house_room = dungeonData.list_tiles[cur_x][cur_y].room_index;
            }
          }
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_GENERATE_MONSTER_HOUSE);
          return;
        }
        counter++;
      }
    }
  }
}
/**
 * NA: 0233C9E8
 * GenerateExtraHallways - Generate extra hallways on the floor via a series of random walks.
 *
 * These paths are often visibly dead-end hallways, or hallways which loop on themselves.
 *
 * Each walk begin at a random tile in a random room, leaving in a random cardinal direction, tunneling
 * through obstacles until it reaches open terrain, is out of bounds, or reaches an impassable obstruction.
 *
 * For each hallway the following steps are done:
 *
 * 1. Select a room, tile, and cardinal direction (specific conditions documented below)
 *
 * 2. Walk from the tile in that direction until we are out of the room, and reach an obstacle (could traverse hallways on the way)
 *
 * 3. Check we're safe to proceed (not at map borders, counterclockwise/clockwise tiles are not open)
 *
 * Begin our random-length walk strides:
 *
 * 4. Check we're safe to proceed (not at borders, not open tile, not impassable wall, will not make a 2x2 open square)
 *
 * 5. Place Open Terrain at this tile
 *
 * 6. Check we're safe to proceed (counterclockwise/clockwise tiles are not open)
 *
 * 7. Check if we've reached the end of the current stride (steps at 0), if so, turn left or right at random and start a new stride.
 *
 * 8. Move in the current direction.
 *
 * Repeat 4-8 until a check fails.
 */
function GenerateExtraHallways(grid, grid_size_x, grid_size_y, num_extra_hallways) {
  //Flag for OnCompletedGenerationStep to verify if an extra hallway was added to the floor
  var added_extra_hallway = false;
  for (var i = 0; i < num_extra_hallways; i++) {
    //Select a random grid cell
    var x = dungeonRand.RandInt(grid_size_x);
    var y = dungeonRand.RandInt(grid_size_y);
    //To generate extra hallways the cell must be:
    // - a room
    // - connected
    // - valid
    // - not a maze room
    if (!grid[x][y].is_room || !grid[x][y].is_connected || grid[x][y].is_invalid || grid[x][y].is_maze_room) continue;
    //Choose a random tile in the room
    var cur_x = dungeonRand.RandRange(grid[x][y].start_x, grid[x][y].end_x);
    var cur_y = dungeonRand.RandRange(grid[x][y].start_y, grid[x][y].end_y);
    //Choose a random cardinal direction
    var direction = dungeonRand.RandInt(4) * 2;
    //if invalid, rotate counter-clockwise until one works
    for (var j = 0; j < 3; j++) {
      if (direction === DirectionId.DIR_DOWN && y >= grid_size_y - 1) {
        direction = DirectionId.DIR_RIGHT;
      }
      if (direction === DirectionId.DIR_RIGHT && x >= grid_size_x - 1) {
        direction = DirectionId.DIR_UP;
      }
      if (direction === DirectionId.DIR_UP && y <= 0) {
        direction = DirectionId.DIR_LEFT;
      }
      if (direction === DirectionId.DIR_LEFT && x <= 0) {
        direction = DirectionId.DIR_DOWN;
      }
    }
    var room_index = dungeonData.list_tiles[cur_x][cur_y].room_index;
    //Walk in the random direction until out of the room
    var continue_walk = true;
    while (continue_walk) {
      if (dungeonData.list_tiles[cur_x][cur_y].room_index === room_index) {
        //LIST_DIRECTIONS gives us the proper (x,y) offset to move one tile
        //in the given direction.
        cur_x += LIST_DIRECTIONS[direction * 4];
        cur_y += LIST_DIRECTIONS[direction * 4 + 2];
      } else {
        continue_walk = false;
      }
    }
    //Keep walking until an obstacle is encountered
    continue_walk = true;
    while (continue_walk) {
      if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        cur_x += LIST_DIRECTIONS[direction * 4];
        cur_y += LIST_DIRECTIONS[direction * 4 + 2];
      } else {
        continue_walk = false;
      }
    }
    //Abort if we reached secondary terrain
    if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_SECONDARY) continue;
    //Check that the current tile is at least 2 away from the map border
    var valid = true;
    for (var _x11 = cur_x - 2; _x11 < cur_x + 3; _x11++) {
      for (var _y10 = cur_y - 2; _y10 < cur_y + 3; _y10++) {
        if (_x11 < 0 || _x11 >= FLOOR_MAX_X || _y10 < 0 || _y10 >= FLOOR_MAX_Y) {
          valid = false;
          break;
        }
      }
      if (!valid) break;
    }
    if (!valid) continue;
    var check_direction = void 0,
      check_x = void 0,
      check_y = void 0;
    //Make sure the direction 90 degrees counterclockwise isn't an open tile
    check_direction = (direction + 2) % 8;
    check_x = cur_x + LIST_DIRECTIONS[check_direction * 4];
    check_y = cur_y + LIST_DIRECTIONS[check_direction * 4 + 2];
    if (dungeonData.list_tiles[check_x][check_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) continue;
    //Do the same for 90 degrees clockwise (or 270 counterclockwise) and make sure it's not an open tile
    check_direction = (direction + 6) % 8;
    check_x = cur_x + LIST_DIRECTIONS[check_direction * 4];
    check_y = cur_y + LIST_DIRECTIONS[check_direction * 4 + 2];
    if (dungeonData.list_tiles[check_x][check_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) continue;
    //Number of steps to walk in one direction before turning
    var steps = dungeonRand.RandInt(3) + 3;
    while (true) {
      //Check for stopping conditions:
      // - Out of bounds or on the 1-tile border of impassable walls
      // - Reached an open tile
      // - Reached an impassable wall
      // - Would result in carving out a 2x2 square (not a hallway at that point)
      if (cur_x <= 1 || cur_y <= 1 || cur_x >= 55 || cur_y >= 31) break;
      if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) break;
      if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.f_impassable_wall) break;
      var will_not_make_square = true;
      //Check Bottom to Right
      if (dungeonData.list_tiles[cur_x + 1][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[cur_x + 1][cur_y + 1].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[cur_x][cur_y + 1].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        will_not_make_square = false;
      }
      //Check Top to Right
      if (dungeonData.list_tiles[cur_x + 1][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[cur_x + 1][cur_y - 1].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[cur_x][cur_y - 1].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        will_not_make_square = false;
      }
      //Check Bottom to Left
      if (dungeonData.list_tiles[cur_x - 1][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[cur_x - 1][cur_y + 1].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[cur_x][cur_y + 1].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        will_not_make_square = false;
      }
      //Check Top to Left
      if (dungeonData.list_tiles[cur_x - 1][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[cur_x - 1][cur_y - 1].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[cur_x][cur_y - 1].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        will_not_make_square = false;
      }
      //If true, make the tile open, it will not produce a 2x2 opening
      //If false, it will abort from neighbor checks so we don't break here
      if (will_not_make_square) {
        dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
      }
      //Make sure the direction 90 degrees counterclockwise isn't an open tile
      check_direction = (direction + 2) % 8;
      check_x = cur_x + LIST_DIRECTIONS[check_direction * 4];
      check_y = cur_y + LIST_DIRECTIONS[check_direction * 4 + 2];
      if (dungeonData.list_tiles[check_x][check_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) break;
      //Do the same for 90 degrees clockwise (or 270 counterclockwise) and make sure it's not an open tile
      check_direction = (direction + 6) % 8;
      check_x = cur_x + LIST_DIRECTIONS[check_direction * 4];
      check_y = cur_y + LIST_DIRECTIONS[check_direction * 4 + 2];
      if (dungeonData.list_tiles[check_x][check_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) break;
      steps -= 1;
      if (steps === 0) {
        steps = dungeonRand.RandInt(3) + 3;
        //Turn left or right with an equal chance
        var rotate_rand = dungeonRand.RandInt(100);
        if (rotate_rand < 50) {
          direction = (direction + 2) % 8;
        } else {
          direction = (direction + 6) % 8;
        }
        //If we'd step into an invalid grid cell, stop
        //(We don't always utilize the entire floor space)
        if (cur_x >= 32 && statusData.floor_size === FloorSize.FLOOR_SIZE_SMALL && direction === DirectionId.DIR_RIGHT) break;
        if (cur_x >= 48 && statusData.floor_size === FloorSize.FLOOR_SIZE_MEDIUM && direction === DirectionId.DIR_RIGHT) break;
      }
      //Move in the current direction
      cur_x += LIST_DIRECTIONS[direction * 4];
      cur_y += LIST_DIRECTIONS[direction * 4 + 2];
    }
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_GENERATE_EXTRA_HALLWAY);
    added_extra_hallway = true;
  }
  if (added_extra_hallway) {
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_GENERATE_EXTRA_HALLWAYS);
  }
}
/**
 * NA: 0233ED34
 * GenerateRoomImperfections - Attempt to generate room imperfections for each room, if flagged to do so.
 *
 * Rooms are flagged for whether to allow imperfections in CreateRoomsAndAnchors.
 * Each qualifying flagged room has a 40% chance to generate imperfections in the room.
 *
 * Imperfections are generated by randomly growing walls of the room inwards
 * for a certain number of iterations, depending on the average length of the room.
 *
 * Each iteration will go in both a counterclockwise and clockwise generation movement (not necessarily for the same corner though)
 *
 * We pick a random corner, derive our direction from the movement being used, then seek up to 10 tiles for one to replace.
 * We avoid getting too close to hallways and ensure our cardinal neighbor tiles match what we expect for open terrain.
 */
function GenerateRoomImperfections(grid, grid_size_x, grid_size_y) {
  //Flag for OnCompleteGenerationStep to verify if any imperfections were actually added
  var added_room_imperfections = false;
  for (var x = 0; x < grid_size_x; x++) {
    for (var y = 0; y < grid_size_y; y++) {
      //To have imperfections a room must:
      // - be valid
      // - not have been merged
      // - be a room
      // - be connected
      // - not have a secondary structure
      // - not be a maze room
      // - be flagged to be made imperfect
      if (grid[x][y].is_invalid || grid[x][y].has_been_merged || grid[x][y].is_merged || !grid[x][y].is_room || !grid[x][y].is_connected || grid[x][y].has_secondary_structure || grid[x][y].is_maze_room || !grid[x][y].flag_imperfect) continue;
      //Roll for imperfections
      //By default, is a 40% chance that the room will still have imperfections
      if (dungeonRand.RandInt(100) < generationConstants.no_imperfections_chance) continue;
      //Flag for OnCompleteGenerationStep to verify if any imperfections were actually added (to this room specifically)
      var added_imperfections_to_this_room = false;
      var length = grid[x][y].end_x - grid[x][y].start_x + (grid[x][y].end_y - grid[x][y].start_y);
      length = Math.max(Math.floor(length / 4), 1);
      //Shrink the room from its corners either in the x or y direction
      //Repeat the number of times equal to the average room length
      for (var counter = 0; counter < length; counter++) {
        for (var i = 0; i < 2; i++) {
          //Start from one of four corners
          // i === 0 => fill in walls counterclockwise
          // i === 1 => fill in walls clockwise
          var starting_corner = dungeonRand.RandInt(4);
          var pt_x = 0,
            pt_y = 0,
            move_x = 0,
            move_y = 0;
          if (starting_corner === 0) {
            //Top-left corner
            pt_x = grid[x][y].start_x;
            pt_y = grid[x][y].start_y;
            if (i === 0) {
              move_x = 0;
              move_y = 1;
            } else {
              move_x = 1;
              move_y = 0;
            }
          } else if (starting_corner === 1) {
            //Top-right corner
            pt_x = grid[x][y].end_x - 1;
            pt_y = grid[x][y].start_y;
            if (i === 0) {
              move_x = -1;
              move_y = 0;
            } else {
              move_x = 0;
              move_y = 1;
            }
          } else if (starting_corner === 2) {
            //Bottom-right corner
            pt_x = grid[x][y].end_x - 1;
            pt_y = grid[x][y].end_y - 1;
            if (i === 0) {
              move_x = 0;
              move_y = -1;
            } else {
              move_x = -1;
              move_y = 0;
            }
          } else if (starting_corner === 3) {
            //Bottom-left corner
            pt_x = grid[x][y].start_x;
            pt_y = grid[x][y].end_y - 1;
            if (i === 0) {
              move_x = 1;
              move_y = 0;
            } else {
              move_x = 0;
              move_y = -1;
            }
          }
          //Search up to 10 tiles for a new tile to replace
          //from the selected starting corner and direction
          for (var v = 0; v < 10; v++) {
            //Make sure we're still in bounds
            if (pt_x < grid[x][y].start_x || pt_x >= grid[x][y].end_x || pt_y < grid[x][y].start_y || pt_y >= grid[x][y].end_y) break;
            if (dungeonData.list_tiles[pt_x][pt_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
              //Make sure there aren't any hallways within 2 spaces from the current tile
              //If there are, skip filling it in
              var direction = DirectionId.DIR_DOWN;
              while (direction < 8) {
                var next_x = pt_x + LIST_DIRECTIONS[direction * 4];
                var next_y = pt_y + LIST_DIRECTIONS[direction * 4 + 2];
                var found = false;
                for (var offset_x = -1; offset_x <= 1; offset_x++) {
                  for (var offset_y = -1; offset_y <= 1; offset_y++) {
                    //Search for open terrain which is not a part of a room (a hallway)
                    if (dungeonData.list_tiles[next_x + offset_x][next_y + offset_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
                      if (dungeonData.list_tiles[next_x + offset_x][next_y + offset_y].room_index === 0xff) {
                        found = true;
                        break;
                      }
                    }
                  }
                  if (found) break;
                }
                if (found) break;
                direction += 1;
              }
              //If direction === 8, we didn't find any hallways and are good to proceed
              if (direction === 8) {
                //Check that our cardinal neighbors' terrain types match what we expect for generating new tiles in
                //this direction
                //For example, if we're generating from the top-left corner, we should only expect tiles
                //below us or to our right to have open terrain. If another tile does, we should stop
                //because the resulting room may look strange otherwise
                var base = starting_corner * 8;
                direction = 0;
                while (direction < 8) {
                  var _next_x = pt_x + LIST_DIRECTIONS[direction * 4];
                  var _next_y = pt_y + LIST_DIRECTIONS[direction * 4 + 2];
                  var is_open = void 0;
                  if (dungeonData.list_tiles[_next_x][_next_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
                    is_open = true;
                  } else {
                    is_open = false;
                  }
                  if (CORNER_CARDINAL_NEIGHBOR_EXPECT_OPEN[base + direction] !== is_open) break;
                  // Advance by 2 to only check cardinal directions
                  direction += 2;
                }
                //if direction === 8, the neighbors match what we expect
                if (direction === 8) {
                  //fill in the current open floor tile with a wall
                  dungeonData.list_tiles[pt_x][pt_y].terrain_flags.terrain_type = TerrainType.TERRAIN_WALL;
                  added_room_imperfections = true;
                  added_imperfections_to_this_room = true;
                }
              }
              break;
            } else {
              //The terrain is filled or already a wall, move to the next tile
              pt_x += move_x;
              pt_y += move_y;
            }
          }
        }
      }
      if (added_imperfections_to_this_room) {
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_GENERATE_ROOM_IMPERFECTION);
      }
    }
  }
  if (added_room_imperfections) {
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_GENERATE_ROOM_IMPERFECTIONS);
  }
}
/**
 * NA:0234087C
 * SetSpawnFlag5 - Sets unknown spawn flag 0x5 on all tiles in a room
 */
function SetSpawnFlag5(grid_cell) {
  for (var x = grid_cell.start_x; x < grid_cell.end_x; x++) {
    for (var y = grid_cell.start_y; y < grid_cell.end_y; y++) {
      dungeonData.list_tiles[x][y].spawn_or_visibility_flags.spawn_flags_field_0x5 = true;
    }
  }
}
/**
 * NA: 023408D0
 * IsNextToHallway - Checks if a tile position is either in a hallway or next to one.
 */
function IsNextToHallway(x, y) {
  for (var offset_x = -1; offset_x <= 1; offset_x++) {
    if (x + offset_x < 0) continue;
    if (x + offset_x >= FLOOR_MAX_X) break;
    for (var offset_y = -1; offset_y <= 1; offset_y++) {
      if (y + offset_y < 0) continue;
      if (y + offset_y >= FLOOR_MAX_Y) break;
      if (offset_x !== 0 && offset_y !== 0) continue;
      if (dungeonData.list_tiles[x + offset_x][y + offset_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[x + offset_x][y + offset_y].room_index === 0xff) {
        return true;
      }
    }
  }
  return false;
}
/**
 * NA: 0233D674
 * GenerateSecondaryStructures - Attempt to generate secondary structures in flagged rooms.
 *
 * For a valid flagged room with no extra features, one of the following will attempt to generate:
 * 0. No Secondary Structure
 * 1. A maze (made of water/lava walls), or a "plus" sign fallback, or a single dot in the center fallback
 * 2. Checkerboard pattern of water/lava
 * 3. A central pool in the room made of water/lava
 * 4. A central island with items and a warp tile, surrounded by water/lava
 * 5. A horizontal or vertical line of water/lava splitting the room in two.
 *
 * If a room doesn't meet the conditions for the secondary structure chosen, it will be left unchanged.
 */
function GenerateSecondaryStructures(grid, grid_size_x, grid_size_y) {
  //Flag for OnCompleteGenerationStep to verify if any secondary structures were generated
  var generated_secondary_structure = false;
  for (var y = 0; y < grid_size_y; y++) {
    for (var x = 0; x < grid_size_x; x++) {
      //To have a secondary structure a room must be:
      // - valid
      // - not a monster house, merged, or have imperfections
      // - be a room
      // - be flagged for a secondary structure
      if (grid[x][y].is_invalid || grid[x][y].is_monster_house || grid[x][y].is_merged || !grid[x][y].is_room || !grid[x][y].flag_secondary_structure || grid[x][y].flag_imperfect) continue;
      var structure_type = dungeonRand.RandInt(6); //0 = no secondary structure
      var room_size_x = grid[x][y].end_x - grid[x][y].start_x;
      var room_size_y = grid[x][y].end_y - grid[x][y].start_y;
      var middle_x = Math.floor((grid[x][y].end_x + grid[x][y].start_x) / 2);
      var middle_y = Math.floor((grid[x][y].end_y + grid[x][y].start_y) / 2);
      if (structure_type === SecondaryStructureType.SECONDARY_STRUCTURE_MAZE_PLUS_DOT && statusData.secondary_structures_budget > 0) {
        statusData.secondary_structures_budget -= 1;
        //If the dimensions are odd, generate a maze room
        if (room_size_x % 2 !== 0 && room_size_y % 2 !== 0) {
          //Both dimensions are odd. Generate a maze room
          SetSpawnFlag5(grid[x][y]);
          GenerateMaze(grid[x][y], true);
        } else {
          if (room_size_x >= 5 && room_size_y >= 5) {
            //Both dimensions are at least 5, generate a water/lava cross in the center
            dungeonData.list_tiles[middle_x][middle_y].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x][middle_y - 1].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x - 1][middle_y].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x + 1][middle_y].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x][middle_y + 1].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
          } else {
            //Generate a single water/lava spot in the center
            dungeonData.list_tiles[middle_x][middle_y].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
          }
        }
        grid[x][y].has_secondary_structure = true;
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_GENERATE_SECONDARY_STRUCTURE);
        generated_secondary_structure = true;
      } else if (structure_type === SecondaryStructureType.SECONDARY_STRUCTURE_CHECKERBOARD && statusData.secondary_structures_budget > 0) {
        if (room_size_x % 2 !== 0 && room_size_y % 2 !== 0) {
          //Dimensions are odd, generate diagonal stripes/checkerboard of water/lava
          statusData.secondary_structures_budget -= 1;
          SetSpawnFlag5(grid[x][y]);
          for (var i = 0; i < 64; i++) {
            var rand_x = dungeonRand.RandInt(room_size_x);
            var rand_y = dungeonRand.RandInt(room_size_y);
            if ((rand_x + rand_y) % 2 !== 0) {
              dungeonData.list_tiles[grid[x][y].start_x + rand_x][grid[x][y].start_y + rand_y].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            }
          }
          grid[x][y].has_secondary_structure = true;
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_GENERATE_SECONDARY_STRUCTURE);
          generated_secondary_structure = true;
        }
      } else if (structure_type === SecondaryStructureType.SECONDARY_STRUCTURE_POOL) {
        if (room_size_x >= 5 && room_size_y >= 5) {
          //Both dimensions are at least 5, generate a "pool" of water/lava
          var rand_x1 = dungeonRand.RandRange(grid[x][y].start_x + 2, grid[x][y].end_x - 3);
          var rand_y1 = dungeonRand.RandRange(grid[x][y].start_y + 2, grid[x][y].end_y - 3);
          var rand_x2 = dungeonRand.RandRange(grid[x][y].start_x + 2, grid[x][y].end_x - 3);
          var rand_y2 = dungeonRand.RandRange(grid[x][y].start_y + 2, grid[x][y].end_y - 3);
          if (statusData.secondary_structures_budget > 0) {
            statusData.secondary_structures_budget -= 1;
            SetSpawnFlag5(grid[x][y]);
            if (rand_x1 > rand_x2) {
              var temp = rand_x1;
              rand_x1 = rand_x2;
              rand_x2 = temp;
            }
            if (rand_y1 > rand_y2) {
              var _temp2 = rand_y2;
              rand_y1 = rand_y2;
              rand_y2 = _temp2;
            }
            for (var cur_x = rand_x1; cur_x <= rand_x2; cur_x++) {
              for (var cur_y = rand_y1; cur_y <= rand_y2; cur_y++) {
                dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
              }
            }
            grid[x][y].has_secondary_structure = true;
            OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_GENERATE_SECONDARY_STRUCTURE);
            generated_secondary_structure = true;
          }
        }
      } else if (structure_type === SecondaryStructureType.SECONDARY_STRUCTURE_ISLAND) {
        if (room_size_x >= 6 && room_size_y >= 6) {
          //Both dimensions are at least 6. Generate an "island" with lava, items, and a Warp Tile at the center
          if (statusData.secondary_structures_budget > 0) {
            statusData.secondary_structures_budget -= 1;
            SetSpawnFlag5(grid[x][y]);
            //Water "Moat"
            dungeonData.list_tiles[middle_x - 2][middle_y - 2].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x - 2][middle_y - 2].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x - 1][middle_y - 2].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x - 1][middle_y - 2].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x][middle_y - 2].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x][middle_y - 2].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x + 1][middle_y - 2].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x + 1][middle_y - 2].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x - 2][middle_y - 1].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x - 2][middle_y - 1].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x - 2][middle_y].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x - 2][middle_y].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x - 2][middle_y + 1].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x - 2][middle_y + 1].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x - 1][middle_y + 1].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x - 1][middle_y + 1].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x][middle_y + 1].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x][middle_y + 1].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x + 1][middle_y - 2].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x + 1][middle_y - 2].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x + 1][middle_y - 1].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x + 1][middle_y - 1].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x + 1][middle_y].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x + 1][middle_y].terrain_flags.f_corner_cuttable = true;
            dungeonData.list_tiles[middle_x + 1][middle_y + 1].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            dungeonData.list_tiles[middle_x + 1][middle_y + 1].terrain_flags.f_corner_cuttable = true;
            //Warp Tile
            dungeonData.list_tiles[middle_x - 1][middle_y - 1].spawn_or_visibility_flags.f_trap = true;
            dungeonData.list_tiles[middle_x - 1][middle_y - 1].spawn_or_visibility_flags.f_special_tile = true;
            dungeonData.list_tiles[middle_x - 1][middle_y - 1].spawn_or_visibility_flags.spawn_flags_field_0x6 = true;
            //Items
            dungeonData.list_tiles[middle_x][middle_y - 1].spawn_or_visibility_flags.f_item = true;
            dungeonData.list_tiles[middle_x][middle_y - 1].spawn_or_visibility_flags.f_special_tile = true;
            dungeonData.list_tiles[middle_x - 1][middle_y].spawn_or_visibility_flags.f_item = true;
            dungeonData.list_tiles[middle_x - 1][middle_y].spawn_or_visibility_flags.f_special_tile = true;
            dungeonData.list_tiles[middle_x][middle_y].spawn_or_visibility_flags.f_item = true;
            dungeonData.list_tiles[middle_x][middle_y].spawn_or_visibility_flags.f_special_tile = true;
            grid[x][y].has_secondary_structure = true;
            OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_GENERATE_SECONDARY_STRUCTURE);
            generated_secondary_structure = true;
          }
        }
      } else if (structure_type === SecondaryStructureType.SECONDARY_STRUCTURE_DIVIDER && statusData.secondary_structures_budget > 0) {
        //Generate a "split room" with two sides separated by a line of water/lava
        statusData.secondary_structures_budget -= 1;
        SetSpawnFlag5(grid[x][y]);
        var valid = true;
        if (dungeonRand.RandInt(2) === 0) {
          //Split the room with a horizontal line
          for (var _i3 = grid[x][y].start_x; _i3 < grid[x][y].end_x; _i3++) {
            if (IsNextToHallway(_i3, middle_y)) {
              valid = false;
              break;
            }
          }
          if (valid) {
            for (var _i4 = grid[x][y].start_x; _i4 < grid[x][y].end_x; _i4++) {
              dungeonData.list_tiles[_i4][middle_y].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            }
            for (var _cur_x7 = grid[x][y].start_x; _cur_x7 < grid[x][y].end_x; _cur_x7++) {
              for (var _cur_y7 = grid[x][y].start_y; _cur_y7 < grid[x][y].end_y; _cur_y7++) {
                dungeonData.list_tiles[_cur_x7][_cur_y7].spawn_or_visibility_flags.spawn_flags_field_0x7 = true;
              }
            }
            grid[x][y].has_secondary_structure = true;
            OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_GENERATE_SECONDARY_STRUCTURE);
            generated_secondary_structure = true;
          }
        } else {
          //Split the room with a vertical line
          for (var _i5 = grid[x][y].start_y; _i5 < grid[x][y].end_y; _i5++) {
            if (IsNextToHallway(middle_x, _i5)) {
              valid = false;
              break;
            }
          }
          if (valid) {
            for (var _i6 = grid[x][y].start_y; _i6 < grid[x][y].end_y; _i6++) {
              dungeonData.list_tiles[middle_x][_i6].terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
            }
            for (var _cur_x8 = grid[x][y].start_x; _cur_x8 < grid[x][y].end_x; _cur_x8++) {
              for (var _cur_y8 = grid[x][y].start_y; _cur_y8 < grid[x][y].end_y; _cur_y8++) {
                dungeonData.list_tiles[_cur_x8][_cur_y8].spawn_or_visibility_flags.spawn_flags_field_0x7 = true;
              }
            }
            grid[x][y].has_secondary_structure = true;
            OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_GENERATE_SECONDARY_STRUCTURE);
            generated_secondary_structure = true;
          }
        }
      }
    }
  }
  if (generated_secondary_structure) {
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_GENERATE_SECONDARY_STRUCTURES);
  }
}
/**
 * NA: 0233B028
 * GenerateStandardFloor - Generates a standard, typical floor layout.
 *
 * Overview:
 * 1. Determine the grid based on grid_size_x, grid_size_y
 * 2. Assign and create rooms and hallway anchors to each grid cell
 * 3. Assign and create connections between grid cells (these are traditional hallways connecting the map together)
 * 4. Fix any unconnected grid cells by adding more connections or removing their rooms/hallway anchors
 * 5. Generate special rooms like a Maze Room (unused in vanilla), Kecleon Shop, or Monster House
 * 6. Create additional "extra hallways" with random walks outside of existing rooms
 * 7. Finalize extra room details with imperfections (unused in vanilla), and structures with secondary terrain
 */
function GenerateStandardFloor(grid_size_x, grid_size_y, floor_props) {
  var _GetGridPositions = GetGridPositions(grid_size_x, grid_size_y),
    list_x = _GetGridPositions.list_x,
    list_y = _GetGridPositions.list_y;
  grid_cell_start_x = list_x;
  grid_cell_start_y = list_y;
  var grid = InitDungeonGrid(grid_size_x, grid_size_y);
  AssignRooms(grid, grid_size_x, grid_size_y, floor_props.room_density);
  CreateRoomsAndAnchors(grid, grid_size_x, grid_size_y, list_x, list_y, floor_props.room_flags);
  var cursor_x = dungeonRand.RandInt(grid_size_x);
  var cursor_y = dungeonRand.RandInt(grid_size_y);
  AssignGridCellConnections(grid, grid_size_x, grid_size_y, cursor_x, cursor_y, floor_props);
  CreateGridCellConnections(grid, grid_size_x, grid_size_y, list_x, list_y, false);
  EnsureConnectedGrid(grid, grid_size_x, grid_size_y, list_x, list_y);
  GenerateMazeRoom(grid, grid_size_x, grid_size_y, floor_props.maze_room_chance);
  GenerateKecleonShop(grid, grid_size_x, grid_size_y, statusData.kecleon_shop_chance);
  GenerateMonsterHouse(grid, grid_size_x, grid_size_y, statusData.monster_house_chance);
  GenerateExtraHallways(grid, grid_size_x, grid_size_y, floor_props.num_extra_hallways);
  GenerateRoomImperfections(grid, grid_size_x, grid_size_y);
  GenerateSecondaryStructures(grid, grid_size_x, grid_size_y);
}
/**
 * NA: 0233C774
 * GenerateOneRoomMonsterHouseFloor - Generates a floor layout with just one large room which is a Monster House.
 *
 * This generator is used as a fallback in the event generation fails too many times.
 */
function GenerateOneRoomMonsterHouseFloor() {
  var grid = InitDungeonGrid(1, 1);
  grid[0][0].start_x = 2;
  grid[0][0].end_x = 0x36;
  grid[0][0].start_y = 2;
  grid[0][0].end_y = 0x1e;
  grid[0][0].is_room = true;
  grid[0][0].is_connected = true;
  grid[0][0].is_invalid = false;
  for (var x = grid[0][0].start_x; x < grid[0][0].end_x; x++) {
    for (var y = grid[0][0].start_y; y < grid[0][0].end_y; y++) {
      dungeonData.list_tiles[x][y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
      dungeonData.list_tiles[x][y].room_index = 0;
    }
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_ONE_ROOM_MONSTER_HOUSE_FLOOR);
  GenerateMonsterHouse(grid, 1, 1, 999);
}
/**
 * NA: 0233B190
 * GenerateOuterRingFloor - Generates on a 6x4 grid, with the outer border of grid cells being hallways and the inner 4x2 grid being rooms.
 *
 * It's "that one floor" in Apple Woods
 */
function GenerateOuterRingFloor(floor_props) {
  var grid_size_x = 6;
  var grid_size_y = 4;
  var list_x = [0, 5, 0x10, 0x1c, 0x27, 0x33, 0x38];
  var list_y = [2, 7, 0x10, 0x19, 0x1e];
  grid_cell_start_x = list_x;
  grid_cell_start_y = list_y;
  var grid = InitDungeonGrid(grid_size_x, grid_size_y);
  //Mark the outer ring as not being rooms
  for (var x = 0; x < grid_size_x; x++) {
    grid[x][0].is_room = false;
    grid[x][grid_size_y - 1].is_room = false;
  }
  for (var y = 0; y < grid_size_y; y++) {
    grid[0][y].is_room = false;
    grid[grid_size_x - 1][y].is_room = false;
  }
  //Mark the inner tiles as rooms
  for (var _x12 = 1; _x12 < grid_size_x - 1; _x12++) {
    for (var _y11 = 1; _y11 < grid_size_y - 1; _y11++) {
      grid[_x12][_y11].is_room = true;
    }
  }
  var cur_room_index = 0;
  for (var _y12 = 0; _y12 < grid_size_y; _y12++) {
    for (var _x13 = 0; _x13 < grid_size_x; _x13++) {
      if (grid[_x13][_y12].is_room) {
        //Room
        var range_x = list_x[_x13 + 1] - list_x[_x13] - 3;
        var range_y = list_y[_y12 + 1] - list_y[_y12] - 3;
        var room_size_x = dungeonRand.RandRange(5, range_x);
        var room_size_y = dungeonRand.RandRange(4, range_y);
        var start_x = dungeonRand.RandInt(range_x - room_size_x) + list_x[_x13] + 2;
        var start_y = dungeonRand.RandInt(range_y - room_size_y) + list_y[_y12] + 2;
        grid[_x13][_y12].start_x = start_x;
        grid[_x13][_y12].start_y = start_y;
        grid[_x13][_y12].end_x = start_x + room_size_x;
        grid[_x13][_y12].end_y = start_y + room_size_y;
        for (var cur_x = grid[_x13][_y12].start_x; cur_x < grid[_x13][_y12].end_x; cur_x++) {
          for (var cur_y = grid[_x13][_y12].start_y; cur_y < grid[_x13][_y12].end_y; cur_y++) {
            dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
            dungeonData.list_tiles[cur_x][cur_y].room_index = cur_room_index;
          }
        }
        cur_room_index += 1;
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_ROOM);
      } else {
        //Hallway Anchor
        var _start_x = dungeonRand.RandRange(list_x[_x13] + 1, list_x[_x13 + 1] - 2);
        var _start_y = dungeonRand.RandRange(list_y[_y12] + 1, list_y[_y12 + 1] - 2);
        grid[_x13][_y12].start_x = _start_x;
        grid[_x13][_y12].start_y = _start_y;
        grid[_x13][_y12].end_x = _start_x + 1;
        grid[_x13][_y12].end_y = _start_y + 1;
        dungeonData.list_tiles[_start_x][_start_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
        dungeonData.list_tiles[_start_x][_start_y].room_index = 0xff;
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_ANCHOR);
      }
    }
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_OUTER_RING_FLOOR);
  grid[0][0].connected_to_right = true;
  grid[1][0].connected_to_left = true;
  grid[1][0].connected_to_right = true;
  grid[2][0].connected_to_left = true;
  grid[2][0].connected_to_right = true;
  grid[3][0].connected_to_left = true;
  grid[3][0].connected_to_right = true;
  grid[4][0].connected_to_left = true;
  grid[4][0].connected_to_right = true;
  grid[5][0].connected_to_left = true;
  grid[0][0].connected_to_bottom = true;
  grid[0][1].connected_to_top = true;
  grid[0][1].connected_to_bottom = true;
  grid[0][2].connected_to_top = true;
  grid[0][2].connected_to_bottom = true;
  grid[0][3].connected_to_top = true;
  grid[0][3].connected_to_right = true;
  grid[1][3].connected_to_left = true;
  grid[1][3].connected_to_right = true;
  grid[2][3].connected_to_left = true;
  grid[2][3].connected_to_right = true;
  grid[3][3].connected_to_left = true;
  grid[3][3].connected_to_right = true;
  grid[4][3].connected_to_left = true;
  grid[4][3].connected_to_right = true;
  grid[5][3].connected_to_left = true;
  grid[5][0].connected_to_bottom = true;
  grid[5][1].connected_to_top = true;
  grid[5][1].connected_to_bottom = true;
  grid[5][2].connected_to_top = true;
  grid[5][2].connected_to_bottom = true;
  grid[5][3].connected_to_top = true;
  var cursor_x = dungeonRand.RandInt(grid_size_x);
  var cursor_y = dungeonRand.RandInt(grid_size_y);
  AssignGridCellConnections(grid, grid_size_x, grid_size_y, cursor_x, cursor_y, floor_props);
  CreateGridCellConnections(grid, grid_size_x, grid_size_y, list_x, list_y, false);
  EnsureConnectedGrid(grid, grid_size_x, grid_size_y, list_x, list_y);
  GenerateKecleonShop(grid, grid_size_x, grid_size_y, statusData.kecleon_shop_chance);
  GenerateMonsterHouse(grid, grid_size_x, grid_size_y, statusData.monster_house_chance);
  GenerateExtraHallways(grid, grid_size_x, grid_size_y, floor_props.num_extra_hallways);
  GenerateRoomImperfections(grid, grid_size_x, grid_size_y);
}
/**
 * NA: 0233B61C
 * GenerateCrossroadsFloor - Generates a floor layout with hallways on the inside and rooms on the outside, with empty corners.
 *
 * Also nicknamed "Ladder Layout" by some.
 */
function GenerateCrossroadsFloor(floor_props) {
  var grid_size_x = 5;
  var grid_size_y = 4;
  var list_x = [0, 0xb, 0x16, 0x21, 0x2c, 0x38];
  var list_y = [1, 9, 0x10, 0x17, 0x1f];
  grid_cell_start_x = list_x;
  grid_cell_start_y = list_y;
  var grid = InitDungeonGrid(grid_size_x, grid_size_y);
  //Mark the outer ring as rooms
  for (var x = 0; x < grid_size_x; x++) {
    grid[x][0].is_room = true;
    grid[x][grid_size_y - 1].is_room = true;
  }
  for (var y = 0; y < grid_size_y; y++) {
    grid[0][y].is_room = true;
    grid[grid_size_x - 1][y].is_room = true;
  }
  //Mark the inner cells as hallways
  for (var _x14 = 1; _x14 < grid_size_x - 1; _x14++) {
    for (var _y13 = 1; _y13 < grid_size_y - 1; _y13++) {
      grid[_x14][_y13].is_room = false;
    }
  }
  //Invalidate the corners
  grid[0][0].is_invalid = true;
  grid[0][grid_size_y - 1].is_invalid = true;
  grid[grid_size_x - 1][0].is_invalid = true;
  grid[grid_size_x - 1][grid_size_y - 1].is_invalid = true;
  var cur_room_index = 0;
  for (var _y14 = 0; _y14 < grid_size_y; _y14++) {
    for (var _x15 = 0; _x15 < grid_size_x; _x15++) {
      if (grid[_x15][_y14].is_invalid) continue;
      if (grid[_x15][_y14].is_room) {
        //Room
        var range_x = list_x[_x15 + 1] - list_x[_x15] - 3;
        var range_y = list_y[_y14 + 1] - list_y[_y14] - 3;
        var room_size_x = dungeonRand.RandRange(5, range_x);
        var room_size_y = dungeonRand.RandRange(4, range_y);
        var start_x = dungeonRand.RandInt(range_x - room_size_x) + list_x[_x15] + 2;
        var start_y = dungeonRand.RandInt(range_y - room_size_y) + list_y[_y14] + 2;
        grid[_x15][_y14].start_x = start_x;
        grid[_x15][_y14].start_y = start_y;
        grid[_x15][_y14].end_x = start_x + room_size_x;
        grid[_x15][_y14].end_y = start_y + room_size_y;
        for (var cur_x = grid[_x15][_y14].start_x; cur_x < grid[_x15][_y14].end_x; cur_x++) {
          for (var cur_y = grid[_x15][_y14].start_y; cur_y < grid[_x15][_y14].end_y; cur_y++) {
            dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
            dungeonData.list_tiles[cur_x][cur_y].room_index = cur_room_index;
          }
        }
        cur_room_index += 1;
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_ROOM);
      } else {
        //Hallway Anchor
        var _start_x2 = dungeonRand.RandRange(list_x[_x15] + 1, list_x[_x15 + 1] - 2);
        var _start_y2 = dungeonRand.RandRange(list_y[_y14] + 1, list_y[_y14 + 1] - 2);
        grid[_x15][_y14].start_x = _start_x2;
        grid[_x15][_y14].start_y = _start_y2;
        grid[_x15][_y14].end_x = _start_x2 + 1;
        grid[_x15][_y14].end_y = _start_y2 + 1;
        dungeonData.list_tiles[_start_x2][_start_y2].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
        dungeonData.list_tiles[_start_x2][_start_y2].room_index = 0xff;
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_ANCHOR);
      }
    }
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_CROSSROADS_FLOOR);
  for (var _x16 = 1; _x16 < grid_size_x - 1; _x16++) {
    for (var _y15 = 0; _y15 < grid_size_y - 1; _y15++) {
      grid[_x16][_y15].connected_to_bottom = true;
      grid[_x16][_y15 + 1].connected_to_top = true;
    }
  }
  for (var _x17 = 0; _x17 < grid_size_x - 1; _x17++) {
    for (var _y16 = 1; _y16 < grid_size_y - 1; _y16++) {
      grid[_x17][_y16].connected_to_right = true;
      grid[_x17 + 1][_y16].connected_to_left = true;
    }
  }
  CreateGridCellConnections(grid, grid_size_x, grid_size_y, list_x, list_y, true);
  EnsureConnectedGrid(grid, grid_size_x, grid_size_y, list_x, list_y);
  GenerateKecleonShop(grid, grid_size_x, grid_size_y, statusData.kecleon_shop_chance);
  GenerateMonsterHouse(grid, grid_size_x, grid_size_y, statusData.monster_house_chance);
  GenerateExtraHallways(grid, grid_size_x, grid_size_y, floor_props.num_extra_hallways);
  GenerateRoomImperfections(grid, grid_size_x, grid_size_y);
}
/**
 * NA: 0233C844
 * GenerateTwoRoomsWithMonsterHouseFloor - Generates a floor layout with two rooms (left and right), with one being a Monster House.
 */
function GenerateTwoRoomsWithMonsterHouseFloor() {
  var grid_size_x = 2;
  var grid_size_y = 1;
  var list_x = [2, 0x1c, 0x36];
  var list_y = [2, 0x1e];
  grid_cell_start_x = list_x;
  grid_cell_start_y = list_y;
  var grid = InitDungeonGrid(grid_size_x, grid_size_y);
  var cur_room_index = 0;
  var y = 0;
  for (var x = 0; x < grid_size_x; x++) {
    var range_x = list_x[x + 1] - list_x[x] - 3;
    var range_y = list_y[y + 1] - list_y[y] - 3;
    var room_size_x = dungeonRand.RandRange(10, range_x);
    var room_size_y = dungeonRand.RandRange(16, range_y);
    var start_x = dungeonRand.RandInt(range_x - room_size_x) + list_x[x] + 1;
    var start_y = dungeonRand.RandInt(range_y - room_size_y) + list_y[y] + 1;
    grid[x][y].start_x = start_x;
    grid[x][y].start_y = start_y;
    grid[x][y].end_x = start_x + room_size_x;
    grid[x][y].end_y = start_y + room_size_y;
    for (var cur_x = grid[x][y].start_x; cur_x < grid[x][y].end_x; cur_x++) {
      for (var cur_y = grid[x][y].start_y; cur_y < grid[x][y].end_y; cur_y++) {
        dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
        dungeonData.list_tiles[cur_x][cur_y].room_index = cur_room_index;
      }
    }
    cur_room_index++;
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_CREATE_ROOM);
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_TWO_ROOMS_WITH_MONSTER_HOUSE_FLOOR);
  grid[0][0].connected_to_right = true;
  grid[1][0].connected_to_left = true;
  CreateGridCellConnections(grid, grid_size_x, grid_size_y, list_x, list_y, false);
  GenerateMonsterHouse(grid, grid_size_x, grid_size_y, 999);
}
/**
 * NA: 0233BA7C
 * GenerateLineFloor - Generates a floor layout with 5 grid cells in a horizontal line.
 */
function GenerateLineFloor(floor_props) {
  var grid_size_x = 5;
  var grid_size_y = 1;
  var list_x = [0, 0xb, 0x16, 0x21, 0x2c, 0x38];
  var list_y = [4, 0xf];
  grid_cell_start_x = list_x;
  grid_cell_start_y = list_y;
  var grid = InitDungeonGrid(grid_size_x, grid_size_y);
  AssignRooms(grid, grid_size_x, grid_size_y, floor_props.room_density);
  CreateRoomsAndAnchors(grid, grid_size_x, grid_size_y, list_x, list_y, floor_props.room_flags);
  var cursor_x = dungeonRand.RandInt(grid_size_x);
  var cursor_y = dungeonRand.RandInt(grid_size_y);
  AssignGridCellConnections(grid, grid_size_x, grid_size_y, cursor_x, cursor_y, floor_props);
  CreateGridCellConnections(grid, grid_size_x, grid_size_y, list_x, list_y, true);
  EnsureConnectedGrid(grid, grid_size_x, grid_size_y, list_x, list_y);
  GenerateKecleonShop(grid, grid_size_x, grid_size_y, statusData.kecleon_shop_chance);
  GenerateMonsterHouse(grid, grid_size_x, grid_size_y, statusData.monster_house_chance);
  GenerateExtraHallways(grid, grid_size_x, grid_size_y, floor_props.num_extra_hallways);
  GenerateRoomImperfections(grid, grid_size_x, grid_size_y);
}
/**
 * NA: 0233BBDC
 * GenerateCrossFloor - Generates a floor layout with 5 rooms arranged in a "plus" or "cross" configuration.
 */
function GenerateCrossFloor(floor_props) {
  var grid_size_x = 3;
  var grid_size_y = 3;
  var list_x = [0xb, 0x16, 0x21, 0x2c];
  var list_y = [2, 0xb, 0x14, 0x1e];
  grid_cell_start_x = list_x;
  grid_cell_start_y = list_y;
  var grid = InitDungeonGrid(grid_size_x, grid_size_y);
  //Set all cells as rooms
  for (var x = 0; x < grid_size_x; x++) {
    for (var y = 0; y < grid_size_y; y++) {
      grid[x][y].is_room = true;
    }
  }
  //Invalidate the corners
  grid[0][0].is_invalid = true;
  grid[0][grid_size_y - 1].is_invalid = true;
  grid[grid_size_x - 1][0].is_invalid = true;
  grid[grid_size_x - 1][grid_size_y - 1].is_invalid = true;
  CreateRoomsAndAnchors(grid, grid_size_x, grid_size_y, list_x, list_y, floor_props.room_flags);
  grid[1][0].connected_to_bottom = true;
  grid[1][1].connected_to_top = true;
  grid[1][1].connected_to_bottom = true;
  grid[1][2].connected_to_top = true;
  grid[0][1].connected_to_right = true;
  grid[1][1].connected_to_left = true;
  grid[1][1].connected_to_right = true;
  grid[2][1].connected_to_left = true;
  CreateGridCellConnections(grid, grid_size_x, grid_size_y, list_x, list_y, true);
  EnsureConnectedGrid(grid, grid_size_x, grid_size_y, list_x, list_y);
  GenerateKecleonShop(grid, grid_size_x, grid_size_y, statusData.kecleon_shop_chance);
  GenerateMonsterHouse(grid, grid_size_x, grid_size_y, statusData.monster_house_chance);
  GenerateExtraHallways(grid, grid_size_x, grid_size_y, floor_props.num_extra_hallways);
  GenerateRoomImperfections(grid, grid_size_x, grid_size_y);
}
/**
 * NA: 0233BF30
 * MergeRoomsVertically - Merges two vertically stacked rooms into one larger room.
 */
function MergeRoomsVertically(room_x, room_y1, room_dy, grid) {
  var room_y2 = room_y1 + room_dy;
  var start_x = Math.min(grid[room_x][room_y1].start_x, grid[room_x][room_y2].start_x);
  var end_x = Math.max(grid[room_x][room_y1].end_x, grid[room_x][room_y2].end_x);
  var start_y = grid[room_x][room_y1].start_y;
  var end_y = grid[room_x][room_y2].end_y;
  //Carve out the new larger room, retaining the index of the first room
  var room_index = dungeonData.list_tiles[grid[room_x][room_y1].start_x][grid[room_x][room_y1].start_y].room_index;
  for (var x = start_x; x < end_x; x++) {
    for (var y = start_y; y < end_y; y++) {
      dungeonData.list_tiles[x][y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
      dungeonData.list_tiles[x][y].room_index = room_index;
    }
  }
  //Assign the new grid cell room space
  grid[room_x][room_y1].start_x = start_x;
  grid[room_x][room_y1].start_y = start_y;
  grid[room_x][room_y1].end_x = end_x;
  grid[room_x][room_y1].end_y = end_y;
  grid[room_x][room_y1].is_merged = true;
  grid[room_x][room_y2].is_merged = true;
  grid[room_x][room_y2].is_connected = false;
  grid[room_x][room_y2].has_been_merged = true;
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_MERGE_ROOM_VERTICALLY);
}
/**
 * NA: 0233BD74
 * GenerateBeetleFloor - Generates a floor layout in a "beetle" shape, with a
 * 3x3 grid of rooms, a merged center column, and hallways along each row
 */
function GenerateBeetleFloor(floor_props) {
  var grid_size_x = 3;
  var grid_size_y = 3;
  var list_x = [0x5, 0xf, 0x23, 0x32];
  var list_y = [2, 0xb, 0x14, 0x1e];
  grid_cell_start_x = list_x;
  grid_cell_start_y = list_y;
  var grid = InitDungeonGrid(grid_size_x, grid_size_y);
  //Set all cells as rooms
  for (var x = 0; x < grid_size_x; x++) {
    for (var y = 0; y < grid_size_y; y++) {
      grid[x][y].is_room = true;
    }
  }
  CreateRoomsAndAnchors(grid, grid_size_x, grid_size_y, list_x, list_y, floor_props.room_flags);
  //Connect rooms in the same row together
  for (var _y17 = 0; _y17 < grid_size_y; _y17++) {
    grid[0][_y17].connected_to_right = true;
    grid[1][_y17].connected_to_left = true;
    grid[1][_y17].connected_to_right = true;
    grid[2][_y17].connected_to_left = true;
  }
  CreateGridCellConnections(grid, grid_size_x, grid_size_y, list_x, list_y, true);
  //Merge the center column into one large room
  MergeRoomsVertically(1, 0, 1, grid);
  MergeRoomsVertically(1, 0, 2, grid);
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_MERGE_ROOM_VERTICALLY);
  EnsureConnectedGrid(grid, grid_size_x, grid_size_y, list_x, list_y);
  GenerateKecleonShop(grid, grid_size_x, grid_size_y, statusData.kecleon_shop_chance);
  GenerateMonsterHouse(grid, grid_size_x, grid_size_y, statusData.monster_house_chance);
  GenerateExtraHallways(grid, grid_size_x, grid_size_y, floor_props.num_extra_hallways);
  GenerateRoomImperfections(grid, grid_size_x, grid_size_y);
}
/**
 * NA: 0233C07C
 * GenerateOuterRoomsFloor - Generates a floor layout with a ring of rooms and nothing on the interior.
 *
 * This layout is bugged and will not properly connect rooms for grid_size_x < 3.
 */
function GenerateOuterRoomsFloor(grid_size_x, grid_size_y, floor_props) {
  var _GetGridPositions2 = GetGridPositions(grid_size_x, grid_size_y),
    list_x = _GetGridPositions2.list_x,
    list_y = _GetGridPositions2.list_y;
  grid_cell_start_x = list_x;
  grid_cell_start_y = list_y;
  var grid = InitDungeonGrid(grid_size_x, grid_size_y);
  //Make all cells rooms
  for (var x = 0; x < grid_size_x; x++) {
    for (var y = 0; y < grid_size_y; y++) {
      grid[x][y].is_room = true;
    }
  }
  //Invalidate all interior cells
  for (var _x18 = 1; _x18 < grid_size_x - 1; _x18++) {
    for (var _y18 = 1; _y18 < grid_size_y - 1; _y18++) {
      grid[_x18][_y18].is_invalid = true;
    }
  }
  CreateRoomsAndAnchors(grid, grid_size_x, grid_size_y, list_x, list_y, floor_props.room_flags);
  if (advancedGenerationSettings.fix_generate_outer_rooms_floor_error) {
    for (var _x19 = 0; _x19 < grid_size_x; _x19++) {
      if (_x19 > 0) {
        //If not on the left border, connect to the left
        grid[_x19][0].connected_to_left = true;
        grid[_x19][grid_size_y - 1].connected_to_left = true;
      }
      if (_x19 < grid_size_x - 1) {
        //If not on the right border, connect to the right
        grid[_x19 + 1][0].connected_to_right = true;
        grid[_x19 + 1][grid_size_y - 1].connected_to_right = true;
      }
    }
    for (var _y19 = 0; _y19 < grid_size_y; _y19++) {
      if (_y19 > 0) {
        //If not on the top border, connect above
        grid[0][_y19].connected_to_top = true;
        grid[grid_size_x - 1][_y19].connected_to_top = true;
      }
      if (_y19 < grid_size_y - 1) {
        //If not on the bottom border, connect below
        grid[0][_y19 + 1].connected_to_bottom = true;
        grid[grid_size_x - 1][_y19 + 1].connected_to_bottom = true;
      }
    }
  } else {
    //The original implementation fails for grid_size_x <= 2, as one of the branches
    //is never taken, and the other branch does not provide a backup connection, leaving the two sides unconnected.
    //Additionally, there is a minor issue for top/bottom connections which results in hallways being connected from the bottom
    //instead of from the top, but this does not affect the connectivity of the map.
    for (var _x20 = 0; _x20 < grid_size_x; _x20++) {
      if (_x20 > 0) {
        grid[_x20][0].connected_to_right = true;
        grid[_x20][grid_size_y - 1].connected_to_right = true;
      }
      //Bug: if grid_size_x <= 2, this branch will never be run.
      //Additionally, because the branch above this has no meaningful hallways produced for
      //x === 1, no connections will be made between columns here.
      //This results in an unconnected map for grid_size_x <= 2.
      if (_x20 < grid_size_x - 2) {
        grid[_x20 + 1][0].connected_to_left = true;
        grid[_x20 + 1][grid_size_y - 1].connected_to_left = true;
      }
    }
    for (var _y20 = 0; _y20 < grid_size_y; _y20++) {
      if (_y20 > 0) {
        grid[0][_y20].connected_to_top = true;
        grid[grid_size_x - 1][_y20].connected_to_top = true;
      }
      //This connection ends up not being set for the bottom row, but this is fine because the other
      //connection to this room is still correct. The result is that hallways here will using the opposing end
      //of the grid cell boundary for their turns compared to top/bottom hallways between other rows.
      if (_y20 < grid_size_y - 2) {
        grid[0][_y20].connected_to_bottom = true;
        grid[grid_size_x - 1][_y20].connected_to_bottom = true;
      }
    }
  }
  CreateGridCellConnections(grid, grid_size_x, grid_size_y, list_x, list_y, false);
  EnsureConnectedGrid(grid, grid_size_x, grid_size_y, list_x, list_y);
  GenerateMazeRoom(grid, grid_size_x, grid_size_y, floor_props.maze_room_chance);
  GenerateKecleonShop(grid, grid_size_x, grid_size_y, statusData.kecleon_shop_chance);
  GenerateMonsterHouse(grid, grid_size_x, grid_size_y, statusData.monster_house_chance);
  GenerateExtraHallways(grid, grid_size_x, grid_size_y, floor_props.num_extra_hallways);
  GenerateRoomImperfections(grid, grid_size_x, grid_size_y);
  GenerateSecondaryStructures(grid, grid_size_x, grid_size_y);
}
/**
 * NA: 02342B7C
 * ResetInnerBoundaryTileRows - Resets inner boundary tile rows (y === 1 and y === 30)
 * to their initial state of all wall tiles, with impassable walls at the edges.
 *
 * This is needed because during generation these soft border walls may have been altered or breached.
 */
function ResetInnerBoundaryTileRows() {
  for (var x = 0; x < FLOOR_MAX_X; x++) {
    dungeonData.list_tiles[x][1] = new Tile();
    if (x === 0 || x === FLOOR_MAX_X - 1) {
      dungeonData.list_tiles[x][1].terrain_flags.f_impassable_wall = true;
    }
    dungeonData.list_tiles[x][0x1e] = new Tile();
    if (x === 0 || x === FLOOR_MAX_X - 1) {
      dungeonData.list_tiles[x][0x1e].terrain_flags.f_impassable_wall = true;
    }
  }
}
/**
 * NA: 02340A78
 * EnsureImpassableTilesAreWalls - Force all tiles with the impassable flag to be set as walls.
 */
function EnsureImpassableTilesAreWalls() {
  for (var x = 0; x < FLOOR_MAX_X; x++) {
    for (var y = 0; y < FLOOR_MAX_Y; y++) {
      if (dungeonData.list_tiles[x][y].terrain_flags.f_impassable_wall) {
        dungeonData.list_tiles[x][y].terrain_flags.terrain_type = TerrainType.TERRAIN_WALL;
      }
    }
  }
}
/**
 * NA: 0233F93C
 * FinalizeJunctions - Finalizes junction tiles by setting the junction flag and verifying the tiles are open terrain
 *
 * Due to the nature of how this function iterates left-to-right / top-to-bottom, by identifying junctions as any
 * open, non-hallway tile (room_index !== 0xFF) adjacent to an open, hallway tile (room_index === 0xFF), the function
 * runs into issues handling hallway anchors (room_index === 0xFE). The room index of hallway anchors is set to 0xFF using
 * the same loop, which means a hallway anchor may or may not be considered a junction depending on how the connected
 * hallways are oriented.
 *
 * For example, in the configuration below, the "o" tile would be marked as a junction because the neighboring hallway tile
 * to its left comes earlier in iteration, while "o" still has the room index 0xFE, with the algorithm mistaking it for a
 * room tile.
 *
 * X X X X X
 * - - - o X
 * X X X | X
 * X X X | X
 *
 * Alternatively, in the configuration below, the "o" tile would not be marked as a junction because it comes earlier in
 * iteration than any of its neighboring hallway tiles, so its room index is set to 0xFF before it can be marked as a junction.
 * This configuration is actually the only one where a hallway anchor will not be marked as a junction.
 *
 * X X X X X
 * X o - - -
 * X | X X X
 * X | X X X
 */
function FinalizeJunctions() {
  for (var x = 0; x < FLOOR_MAX_X; x++) {
    for (var y = 0; y < FLOOR_MAX_Y; y++) {
      if (dungeonData.list_tiles[x][y].terrain_flags.terrain_type !== TerrainType.TERRAIN_NORMAL) continue;
      //Not in a room
      if (dungeonData.list_tiles[x][y].room_index === 0xff) {
        //Tile to the left is in a room (or anchor), mark junction
        if (x > 0 && dungeonData.list_tiles[x - 1][y].room_index !== 0xff) {
          dungeonData.list_tiles[x - 1][y].terrain_flags.f_natural_junction = true;
          //If there's any water/lava on the junction tile, remove it
          if (dungeonData.list_tiles[x - 1][y].terrain_flags.terrain_type === TerrainType.TERRAIN_SECONDARY) {
            dungeonData.list_tiles[x - 1][y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
          }
        }
        //Tile above is in a room
        else if (y > 0 && dungeonData.list_tiles[x][y - 1].room_index !== 0xff) {
          dungeonData.list_tiles[x][y - 1].terrain_flags.f_natural_junction = true;
          //If there's any water/lava on the junction tile, remove it
          if (dungeonData.list_tiles[x][y - 1].terrain_flags.terrain_type === TerrainType.TERRAIN_SECONDARY) {
            dungeonData.list_tiles[x][y - 1].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
          }
        }
        //Tile below is in a room
        else if (y < FLOOR_MAX_Y - 1 && dungeonData.list_tiles[x][y + 1].room_index !== 0xff) {
          dungeonData.list_tiles[x][y + 1].terrain_flags.f_natural_junction = true;
          //If there's any water/lava on the junction tile, remove it
          if (dungeonData.list_tiles[x][y + 1].terrain_flags.terrain_type === TerrainType.TERRAIN_SECONDARY) {
            dungeonData.list_tiles[x][y + 1].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
          }
        }
        //Tile to the right is in a room
        else if (x < FLOOR_MAX_X - 1 && dungeonData.list_tiles[x + 1][y].room_index !== 0xff) {
          dungeonData.list_tiles[x + 1][y].terrain_flags.f_natural_junction = true;
          //If there's any water/lava on the junction tile, remove it
          if (dungeonData.list_tiles[x + 1][y].terrain_flags.terrain_type === TerrainType.TERRAIN_SECONDARY) {
            dungeonData.list_tiles[x + 1][y].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
          }
        }
      }
      //Hallway Anchor
      else if (dungeonData.list_tiles[x][y].room_index === 0xfe) {
        dungeonData.list_tiles[x][y].room_index = 0xff;
      }
    }
  }
  //TODO: Investigate relevance of GenerateNaturalJunctionList()
  //GenerateNaturalJunctionList();
}
/**
 * NA: 0234176C
 * SetSecondaryTerrainOnWall - Set a specific tile to have secondary terrain if the tile
 * is a passable wall.
 */
function SetSecondaryTerrainOnWall(tile) {
  if (tile.terrain_flags.f_impassable_wall || tile.terrain_flags.terrain_type !== TerrainType.TERRAIN_WALL) return;
  tile.terrain_flags.terrain_type = TerrainType.TERRAIN_SECONDARY;
}
/**
 * NA: 023417AC
 * GenerateSecondaryTerrainFormations - Generates secondary terrain (water/lava) formations
 *
 * This generation includes rivers, lakes along the river path, and standalone lakes.
 *
 * The river flows from top-to-bottom or bottom-to-top, using a random walk ending when the walk
 * goes out of bounds or finds existing secondary terrain. Because of this, rivers can end prematurely
 * when a lake is generated.
 *
 * Lakes are a large collection of secondary terrain generated around a central point.
 * Standalone lakes are generated based on secondary_terrain_density
 *
 * The formations will never cut into room tiles, but can pass through to the other side.
 */
function GenerateSecondaryTerrainFormations(test_flag, floor_props) {
  if (!floor_props.room_flags.f_secondary_terrain_generation || !test_flag) return;
  //Generate 1-3 "river+lake" formations
  var num_to_gen = [1, 1, 1, 2, 2, 2, 3, 3][dungeonRand.RandInt(8)];
  for (var i = 0; i < num_to_gen; i++) {
    //Randomly pick between starting from the bottom going up, or from the top going down
    var pt_x = void 0,
      pt_y = void 0,
      dir_x = void 0,
      dir_y = void 0,
      dir_y_upwards = void 0;
    if (dungeonRand.RandInt(100) < 50) {
      pt_y = FLOOR_MAX_Y - 1;
      dir_y = -1;
      dir_y_upwards = true;
    } else {
      pt_y = 0;
      dir_y = 1;
      dir_y_upwards = false;
    }
    var steps_until_lake = dungeonRand.RandInt(50) + 10;
    //Pick a random column in the interior to start the river on
    pt_x = dungeonRand.RandRange(2, FLOOR_MAX_X - 2);
    dir_x = 0;
    var done = false;
    while (!done) {
      //
      var generated_river_tiles = false;
      //Fill in tiles in chunks of size 2-7 before changing the flow direction
      var num_tiles_fill = dungeonRand.RandInt(6) + 2;
      for (var v = 0; v < num_tiles_fill; v++) {
        if (pt_x >= 0 && pt_x < FLOOR_MAX_X) {
          var tile = void 0;
          if (pt_y >= 0 && pt_y < FLOOR_MAX_Y) {
            tile = dungeonData.list_tiles[pt_x][pt_y];
          } else {
            tile = DEFAULT_TILE;
          }
          if (tile.terrain_flags.terrain_type === TerrainType.TERRAIN_SECONDARY) {
            done = true;
            if (generated_river_tiles) {
              OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SECONDARY_TERRAIN_RIVER);
            }
            break;
          }
          if (!PosIsOutOfBounds(pt_x, pt_y)) {
            //Fill in secondary terrain as we go
            SetSecondaryTerrainOnWall(dungeonData.list_tiles[pt_x][pt_y]);
            generated_river_tiles = true;
          }
        }
        //Move to the next tile
        pt_x += dir_x;
        pt_y += dir_y;
        //Vertically out of bounds, stop
        if (pt_y < 0 || pt_y >= FLOOR_MAX_Y) {
          OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SECONDARY_TERRAIN_RIVER);
          break;
        }
        steps_until_lake -= 1;
        if (steps_until_lake !== 0) continue;
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SECONDARY_TERRAIN_RIVER);
        //After we go a certain number of steps, make a "lake"
        //This loop will attempt to generate new lake tiles up to 64 times
        //We select a random tile, check for space and nearby secondary terrain tiles,
        //then if verified add a new lake tile.
        for (var j = 0; j < 64; j++) {
          //Each tile is in a random location +-3 tiles from the current cursor in either direction
          var offset_x = dungeonRand.RandInt(7) - 3;
          var offset_y = dungeonRand.RandInt(7) - 3;
          var target_x = pt_x + offset_x;
          var target_y = pt_y + offset_y;
          //Check that there's enough space for a lake within a 2 tile margin of the map bounds
          if (target_x >= 2 && target_x < FLOOR_MAX_X - 2 && target_y >= 2 && target_y < FLOOR_MAX_Y - 2) {
            //Make secondary terrain here if it's within 2 tiles
            //of a tile that's currently secondary terrain
            //This results in a "cluster" akin to a lake
            var second_near = false;
            for (var x = -1; x < 2; x++) {
              for (var y = -1; y < 2; y++) {
                if (dungeonData.list_tiles[target_x + x][target_y + y].terrain_flags.terrain_type === TerrainType.TERRAIN_SECONDARY) {
                  second_near = true;
                  break;
                }
              }
              if (second_near) break;
            }
            if (second_near) {
              if (!PosIsOutOfBounds(target_x, target_y)) {
                SetSecondaryTerrainOnWall(dungeonData.list_tiles[target_x][target_y]);
              }
            }
          }
        }
        //Finalization/gap-filling step because the random approach
        //might leave weird gaps. Go through every tile and do an
        //online nearest-neighbor interpolation of secondary terrain
        //tiles to smoothen out the "lake"
        for (var _offset_x = -3; _offset_x < 4; _offset_x++) {
          for (var _offset_y = -3; _offset_y < 4; _offset_y++) {
            var _target_x = pt_x + _offset_x;
            var _target_y = pt_y + _offset_y;
            var num_adjacent = 0;
            if (_target_x >= 2 && _target_x < FLOOR_MAX_X - 2 && _target_y >= 2 && _target_y < FLOOR_MAX_Y - 2) {
              //Count the number of secondary terrain tiles adjacent (all 8 directions)
              for (var _x21 = -1; _x21 < 2; _x21++) {
                for (var _y21 = -1; _y21 < 2; _y21++) {
                  if (_x21 === 0 && _y21 === 0) continue;
                  if (dungeonData.list_tiles[_target_x + _x21][_target_y + _y21].terrain_flags.terrain_type === TerrainType.TERRAIN_SECONDARY) {
                    num_adjacent += 1;
                  }
                }
              }
              //If at least half are secondary terrain, make this tile secondary terrain as well
              if (num_adjacent >= 4) {
                if (!PosIsOutOfBounds(_target_x, _target_y)) {
                  SetSecondaryTerrainOnWall(dungeonData.list_tiles[_target_x][_target_y]);
                }
              }
            }
          }
        }
        OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SECONDARY_TERRAIN_RIVER_LAKE);
      }
      //Creating a lake doesn't mean we are done yet
      //but it's likely that the next iteration will hit the tile
      //stopping condition for secondary terrain, if not the river continues
      if (!done) {
        //Alternate between horizontal and vertical movement each iteration
        if (dir_x !== 0) {
          //The y direction never reverses, ensuring the river doesn't
          //double back on itself and cuts across the map only once
          if (dir_y_upwards) {
            dir_y = -1;
          } else {
            dir_y = 1;
          }
          dir_x = 0;
        } else {
          //Randomly pick between left and right
          if (dungeonRand.RandInt(100) < 50) {
            dir_x = -1;
          } else {
            dir_x = 1;
          }
          dir_y = 0;
        }
      }
      if (pt_y < 0 || pt_y >= FLOOR_MAX_Y) {
        //Vertically out of bounds, stop
        done = true;
      }
    }
  }
  //Generate standalone lakes secondary_terrain_density # of times
  for (var _i7 = 0; _i7 < floor_props.secondary_terrain_density; _i7++) {
    //Try to pick a random tile in the interior to seed the "lake"
    //Incredibly unlikely to fail
    var attempts = 0;
    var rnd_x = 0,
      rnd_y = 0;
    while (attempts < 200) {
      rnd_x = dungeonRand.RandInt(FLOOR_MAX_X);
      rnd_y = dungeonRand.RandInt(FLOOR_MAX_Y);
      if (rnd_x >= 1 && rnd_x < FLOOR_MAX_X - 1 && rnd_y >= 1 && rnd_y < FLOOR_MAX_Y - 1) break;
      attempts++;
    }
    if (attempts === 200) continue;
    //Make a 10x10 grid with true on the boundary and false on the interior
    var table = new Array(10);
    for (var _x22 = 0; _x22 < 10; _x22++) {
      table[_x22] = new Array(10);
      for (var _y22 = 0; _y22 < 10; _y22++) {
        if (_x22 === 0 || _y22 === 0 || _x22 === 9 || _y22 === 9) {
          table[_x22][_y22] = true;
        } else {
          table[_x22][_y22] = false;
        }
      }
    }
    //Generate an "inverse lake" by spreading the true values inwards
    for (var _v = 0; _v < 80; _v++) {
      //Pick a random interior point on the 10x10 grid
      var _x23 = dungeonRand.RandInt(8) + 1;
      var _y23 = dungeonRand.RandInt(8) + 1;
      if (table[_x23 - 1][_y23] || table[_x23 + 1][_y23] || table[_x23][_y23 - 1] || table[_x23][_y23 + 1]) {
        table[_x23][_y23] = true;
      }
    }
    //Iterate through the grid, any spaces which are still false form the inverse-inverse lake
    //or as some may prefer to call it, just a regular lake!
    for (var _x24 = 0; _x24 < 10; _x24++) {
      for (var _y24 = 0; _y24 < 10; _y24++) {
        if (!table[_x24][_y24]) {
          //Shift the 0-10 random offset position into +- 5 to center around the lake seed tile
          if (!PosIsOutOfBounds(rnd_x + _x24 - 5, rnd_y + _y24 - 5)) {
            SetSecondaryTerrainOnWall(dungeonData.list_tiles[rnd_x + _x24 - 5][rnd_y + _y24 - 5]);
          } else {
            SetSecondaryTerrainOnWall(DEFAULT_TILE);
          }
        }
      }
    }
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SECONDARY_TERRAIN_STANDALONE_LAKE);
  }
  //Clean up secondary terrain that got in places it shouldn't
  for (var _x25 = 0; _x25 < FLOOR_MAX_X; _x25++) {
    for (var _y25 = 0; _y25 < FLOOR_MAX_Y; _y25++) {
      if (dungeonData.list_tiles[_x25][_y25].terrain_flags.terrain_type !== TerrainType.TERRAIN_SECONDARY) continue;
      //Revert tiles back to open terrain if:
      // - in a kecleon shop
      // - in a monster house
      // - is an unbreakable tile
      // - on a stairs spawn point
      //This really shouldn't happen since we only place terrain on wall tiles to begin with,
      //but it provides additional safety
      if (dungeonData.list_tiles[_x25][_y25].terrain_flags.f_in_kecleon_shop || dungeonData.list_tiles[_x25][_y25].terrain_flags.f_in_monster_house || dungeonData.list_tiles[_x25][_y25].terrain_flags.f_unbreakable || dungeonData.list_tiles[_x25][_y25].spawn_or_visibility_flags.f_stairs) {
        dungeonData.list_tiles[_x25][_y25].terrain_flags.terrain_type = TerrainType.TERRAIN_NORMAL;
      } else {
        //Revert to wall tiles if they're on the soft/hard borders
        if (_x25 <= 1 || _x25 >= FLOOR_MAX_X - 1 || _y25 <= 1 || _y25 >= FLOOR_MAX_Y - 1) {
          dungeonData.list_tiles[_x25][_y25].terrain_flags.terrain_type = TerrainType.TERRAIN_WALL;
        }
      }
    }
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_GENERATE_SECONDARY_TERRAIN);
}
/**
 * NA: 02342C8C
 * SpawnStairs - Spawns stairs at a given location.
 *
 * If a hidden stairs type is specified, hidden stairs will spawn instead.
 *
 * If spawning normal stairs and the current floor is a rescue floor, the room
 * with the stairs will be converted into a Monster House.
 */
function SpawnStairs(x, y, hidden_stairs_type) {
  dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_item = false;
  dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_stairs = true;
  if (hidden_stairs_type === HiddenStairsType.HIDDEN_STAIRS_NONE) {
    //Normal stairs
    dungeonGenerationInfo.stairs_spawn_x = x;
    dungeonGenerationInfo.stairs_spawn_y = y;
    statusData.stairs_room_index = dungeonData.list_tiles[x][y].room_index;
  } else {
    //Hidden stairs
    if (statusData.second_spawn) {
      statusData.hidden_stairs_spawn_x = x;
      statusData.hidden_stairs_spawn_y = y;
    } else {
      dungeonGenerationInfo.hidden_stairs_spawn_x = x;
      dungeonGenerationInfo.hidden_stairs_spawn_y = y;
      dungeonGenerationInfo.hidden_stairs_type = hidden_stairs_type;
    }
  }
  //If we're spawning normal stairs and this is a rescue floor, make the stairs room a Monster House
  if (hidden_stairs_type === HiddenStairsType.HIDDEN_STAIRS_NONE && GetFloorType() === FloorType.FLOOR_TYPE_RESCUE) {
    var room_index = dungeonData.list_tiles[x][y].room_index;
    for (var cur_x = 0; cur_x < FLOOR_MAX_X; cur_x++) {
      for (var cur_y = 0; cur_y < FLOOR_MAX_Y; cur_y++) {
        if (dungeonData.list_tiles[cur_x][cur_y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[cur_x][cur_y].room_index === room_index) {
          dungeonData.list_tiles[cur_x][cur_y].terrain_flags.f_in_monster_house = true;
          dungeonGenerationInfo.monster_house_room = dungeonData.list_tiles[x][y].room_index;
        }
      }
    }
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SPAWN_STAIRS);
}
/**
 * NA: 02340CE4
 * ShuffleSpawnPositions - Randomly shuffle an array of spawn positions
 */
function ShuffleSpawnPositions(spawn_x, spawn_y) {
  //Do twice as many swaps as there are items in the array
  for (var i = 0; i < spawn_x.length * 2; i++) {
    var a = dungeonRand.RandInt(spawn_x.length);
    var b = dungeonRand.RandInt(spawn_x.length);
    var temp_x = spawn_x[a];
    var temp_y = spawn_y[a];
    spawn_x[a] = spawn_x[b];
    spawn_y[a] = spawn_y[b];
    spawn_x[b] = temp_x;
    spawn_y[b] = temp_y;
  }
}
/**
 * NA: 02340D4C
 * SpawnNonEnemies - Spawns all non-enemy entities: Stairs, Items, Traps, and the player.
 *
 * Most entities spawn randomly on a subset of the valid tiles for their type.
 *
 * These spawns are categorized into:
 * - Stairs (and hidden stairs)
 * - Normal Items
 * - Buried Items
 * - Monster House Items/Traps
 * - Normal Traps
 * - Player Spawn
 *
 * See below for specific conditions on each type of spawn.
 */
function SpawnNonEnemies(floor_props, is_empty_monster_house) {
  //Spawn Stairs
  if (dungeonGenerationInfo.stairs_spawn_x === -1 || dungeonGenerationInfo.stairs_spawn_y === -1) {
    var _valid_spawns_x = [],
      _valid_spawns_y = [];
    for (var x = 0; x < FLOOR_MAX_X; x++) {
      for (var y = 0; y < FLOOR_MAX_Y; y++) {
        //The stairs can spawn on tiles that are:
        // - Open Terrain
        // - In a room
        // - Not in a Kecleon Shop
        // - Not an enemy spawn
        // - Not a special tile (flagged by kecleon shops, traps, and items)
        // - Not a junction tile (next to a hallway)
        // - Not a special tile that can't be broken by Absolute Mover
        if (dungeonData.list_tiles[x][y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[x][y].room_index !== 0xff && !dungeonData.list_tiles[x][y].terrain_flags.f_in_kecleon_shop && !dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_monster && !dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_special_tile && !dungeonData.list_tiles[x][y].terrain_flags.f_natural_junction && !dungeonData.list_tiles[x][y].terrain_flags.f_unbreakable) {
          _valid_spawns_x.push(x);
          _valid_spawns_y.push(y);
        }
      }
    }
    if (_valid_spawns_x.length > 0) {
      //Randomly select one of the valid tiles to spawn the stairs on
      var stairs_index = dungeonRand.RandInt(_valid_spawns_x.length);
      SpawnStairs(_valid_spawns_x[stairs_index], _valid_spawns_y[stairs_index], HiddenStairsType.HIDDEN_STAIRS_NONE);
      if (statusData.hidden_stairs_type !== HiddenStairsType.HIDDEN_STAIRS_NONE) {
        //Spawn hidden stairs, just not where the normal stairs are!
        _valid_spawns_x.splice(stairs_index, 1);
        _valid_spawns_y.splice(stairs_index, 1);
        //Only spawn hidden stairs if we're not on the last floor of the dungeon
        if (dungeonData.floor + 1 < dungeonData.n_floors_plus_one) {
          dungeonRand.DungeonRngSetSecondary(3);
          var hidden_index = dungeonRand.RandInt(_valid_spawns_x.length);
          SpawnStairs(_valid_spawns_x[hidden_index], _valid_spawns_y[hidden_index], statusData.hidden_stairs_type);
        }
      }
    }
  }
  //Spawn normal items
  var valid_spawns_x = [],
    valid_spawns_y = [];
  for (var _x26 = 0; _x26 < FLOOR_MAX_X; _x26++) {
    for (var _y26 = 0; _y26 < FLOOR_MAX_Y; _y26++) {
      //Normal items can spawn on tiles that are:
      // - Open Terrain
      // - In a room
      // - Not in a Kecleon Shop
      // - Not in a Monster House
      // - Not a junction tile (next to a hallway)
      // - Not a special tile that can't be broken by Absolute Mover
      if (dungeonData.list_tiles[_x26][_y26].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[_x26][_y26].room_index !== 0xff && !dungeonData.list_tiles[_x26][_y26].terrain_flags.f_in_kecleon_shop && !dungeonData.list_tiles[_x26][_y26].terrain_flags.f_in_monster_house && !dungeonData.list_tiles[_x26][_y26].terrain_flags.f_natural_junction && !dungeonData.list_tiles[_x26][_y26].terrain_flags.f_unbreakable) {
        valid_spawns_x.push(_x26);
        valid_spawns_y.push(_y26);
      }
    }
  }
  if (valid_spawns_x.length > 0) {
    var num_items = floor_props.item_density;
    if (num_items !== 0) {
      //Add variation to the item count
      num_items = Math.max(dungeonRand.RandRange(num_items - 2, num_items + 2), 1);
    }
    if (dungeonData.guaranteed_item_id !== 0) {
      //Account for a guaranteed item spawn
      num_items += 1;
    }
    dungeonData.num_items = num_items + 1;
    if (num_items + 1 > 0) {
      //Randomly select among the valid item spawn spots
      ShuffleSpawnPositions(valid_spawns_x, valid_spawns_y);
      var cur_index = dungeonRand.RandInt(valid_spawns_x.length);
      num_items += 1;
      for (var i = 0; i < num_items; i++) {
        var pos_x = valid_spawns_x[cur_index];
        var pos_y = valid_spawns_y[cur_index];
        cur_index++;
        if (cur_index === valid_spawns_x.length) {
          //Wrap around to the start
          cur_index = 0;
        }
        //Spawn an item here
        dungeonData.list_tiles[pos_x][pos_y].spawn_or_visibility_flags.f_item = true;
      }
      OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SPAWN_ITEMS);
    }
  }
  //Spawn Buried Items (in walls)
  valid_spawns_x = [];
  valid_spawns_y = [];
  for (var _x27 = 0; _x27 < FLOOR_MAX_X; _x27++) {
    for (var _y27 = 0; _y27 < FLOOR_MAX_Y; _y27++) {
      //Any wall tile is all buried items need
      if (dungeonData.list_tiles[_x27][_y27].terrain_flags.terrain_type === TerrainType.TERRAIN_WALL) {
        valid_spawns_x.push(_x27);
        valid_spawns_y.push(_y27);
      }
    }
  }
  if (valid_spawns_x.length > 0) {
    var _num_items = floor_props.buried_item_density;
    if (_num_items !== 0) {
      //Add variation to the item count
      _num_items = dungeonRand.RandRange(_num_items - 2, _num_items + 2);
    }
    if (_num_items > 0) {
      //Randomly select among the valid item spawn spots
      ShuffleSpawnPositions(valid_spawns_x, valid_spawns_y);
      var _cur_index = dungeonRand.RandInt(valid_spawns_x.length);
      for (var _i8 = 0; _i8 < _num_items; _i8++) {
        var _pos_x = valid_spawns_x[_cur_index];
        var _pos_y = valid_spawns_y[_cur_index];
        _cur_index++;
        if (_cur_index === valid_spawns_x.length) {
          //Wrap around to the start
          _cur_index = 0;
        }
        //Spawn an item here
        dungeonData.list_tiles[_pos_x][_pos_y].spawn_or_visibility_flags.f_item = true;
      }
      OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SPAWN_BURIED_ITEMS);
    }
  }
  //Spawn items/traps in a non-empty Monster House
  valid_spawns_x = [];
  valid_spawns_y = [];
  if (!is_empty_monster_house) {
    for (var _x28 = 0; _x28 < FLOOR_MAX_X; _x28++) {
      for (var _y28 = 0; _y28 < FLOOR_MAX_Y; _y28++) {
        //Monster House items/traps can spawn on tiles that are:
        // - not in a kecleon shop (how would they be?)
        // - in a Monster House
        // - not a junction (near a hallway)
        if (!dungeonData.list_tiles[_x28][_y28].terrain_flags.f_in_kecleon_shop && dungeonData.list_tiles[_x28][_y28].terrain_flags.f_in_monster_house && !dungeonData.list_tiles[_x28][_y28].terrain_flags.f_natural_junction) {
          valid_spawns_x.push(_x28);
          valid_spawns_y.push(_y28);
        }
      }
    }
  }
  if (valid_spawns_x.length > 0) {
    //Choose a subset of the available tiles to spawn stuff on
    var _num_items2 = Math.max(6, dungeonRand.RandRange(Math.floor(5 * valid_spawns_x.length / 10), Math.floor(8 * valid_spawns_x.length / 10)));
    //Cap item spawns at 7 (normally)
    if (_num_items2 >= generationConstants.max_number_monster_house_item_spawns) {
      _num_items2 = generationConstants.max_number_monster_house_item_spawns;
    }
    //Randomly select among the valid item spawn spots
    ShuffleSpawnPositions(valid_spawns_x, valid_spawns_y);
    var _cur_index2 = dungeonRand.RandInt(valid_spawns_x.length);
    for (var _i9 = 0; _i9 < _num_items2; _i9++) {
      var _pos_x2 = valid_spawns_x[_cur_index2];
      var _pos_y2 = valid_spawns_y[_cur_index2];
      _cur_index2++;
      if (_cur_index2 === valid_spawns_x.length) {
        //Wrap around to the start
        _cur_index2 = 0;
      }
      //50/50 chance of spawning an item or a trap
      if (dungeonRand.RandInt(2) === 1) {
        //Spawn an item
        dungeonData.list_tiles[_pos_x2][_pos_y2].spawn_or_visibility_flags.f_item = true;
      } else if (dungeonData.nonstory_flag || dungeonData.id >= generationConstants.first_dungeon_id_allow_monster_house_traps) {
        dungeonData.list_tiles[_pos_x2][_pos_y2].spawn_or_visibility_flags.f_trap = true;
      }
    }
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SPAWN_MONSTER_HOUSE_ITEMS_TRAPS);
  }
  //Spawn Normal Traps
  valid_spawns_x = [];
  valid_spawns_y = [];
  for (var _x29 = 0; _x29 < FLOOR_MAX_X; _x29++) {
    for (var _y29 = 0; _y29 < FLOOR_MAX_Y; _y29++) {
      //Normal traps can spawn on tiles that are:
      // - Open Terrain
      // - In a room
      // - Not in a Kecleon Shop
      // - Don't already have an item spawn
      // - Not a junction tile (next to a hallway)
      // - Not a special tile that can't be broken by Absolute Mover
      if (dungeonData.list_tiles[_x29][_y29].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[_x29][_y29].room_index !== 0xff && !dungeonData.list_tiles[_x29][_y29].terrain_flags.f_in_kecleon_shop && !dungeonData.list_tiles[_x29][_y29].spawn_or_visibility_flags.f_item && !dungeonData.list_tiles[_x29][_y29].terrain_flags.f_natural_junction && !dungeonData.list_tiles[_x29][_y29].terrain_flags.f_unbreakable) {
        valid_spawns_x.push(_x29);
        valid_spawns_y.push(_y29);
      }
    }
  }
  if (valid_spawns_x.length > 0) {
    var num_traps = dungeonRand.RandRange(Math.floor(floor_props.trap_density / 2), floor_props.trap_density);
    if (num_traps > 0) {
      if (num_traps >= 56) {
        //Cap the number of traps at 56
        num_traps = 56;
      }
      //Randomly select among the valid item spawn spots
      ShuffleSpawnPositions(valid_spawns_x, valid_spawns_y);
      var _cur_index3 = dungeonRand.RandInt(valid_spawns_x.length);
      for (var _i10 = 0; _i10 < num_traps; _i10++) {
        var _pos_x3 = valid_spawns_x[_cur_index3];
        var _pos_y3 = valid_spawns_y[_cur_index3];
        _cur_index3++;
        if (_cur_index3 === valid_spawns_x.length) {
          //Wrap around to the start
          _cur_index3 = 0;
        }
        //Spawn a trap here
        dungeonData.list_tiles[_pos_x3][_pos_y3].spawn_or_visibility_flags.f_trap = true;
      }
      OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SPAWN_TRAPS);
    }
  }
  var is_rescue_floor;
  if (GetFloorType() === FloorType.FLOOR_TYPE_RESCUE) {
    is_rescue_floor = true;
  } else {
    is_rescue_floor = false;
  }
  //Spawn the player
  if (dungeonGenerationInfo.player_spawn_x === -1 || dungeonGenerationInfo.player_spawn_y === -1) {
    var _valid_spawns_x2 = [],
      _valid_spawns_y2 = [];
    for (var _x30 = 0; _x30 < FLOOR_MAX_X; _x30++) {
      for (var _y30 = 0; _y30 < FLOOR_MAX_Y; _y30++) {
        //The player can spawn on tiles that are:
        // - Open Terrain
        // - In a room
        // - Not in a Kecleon Shop
        // - Not a junction tile (next to a hallway)
        // - Not a special tile that can't be broken by Absolute Mover
        // - Not an item, enemy, or trap spawn
        if (dungeonData.list_tiles[_x30][_y30].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[_x30][_y30].room_index !== 0xff && !dungeonData.list_tiles[_x30][_y30].terrain_flags.f_in_kecleon_shop && !dungeonData.list_tiles[_x30][_y30].terrain_flags.f_natural_junction && !dungeonData.list_tiles[_x30][_y30].terrain_flags.f_unbreakable && !dungeonData.list_tiles[_x30][_y30].spawn_or_visibility_flags.f_item && !dungeonData.list_tiles[_x30][_y30].spawn_or_visibility_flags.f_monster && !dungeonData.list_tiles[_x30][_y30].spawn_or_visibility_flags.f_trap) {
          //Also, on rescue floors the player can't spawn directly on the stairs
          if (!is_rescue_floor || !dungeonData.list_tiles[_x30][_y30].spawn_or_visibility_flags.f_stairs) {
            _valid_spawns_x2.push(_x30);
            _valid_spawns_y2.push(_y30);
          }
        }
      }
    }
    if (_valid_spawns_x2.length > 0) {
      //Randomly select one of the valid tiles to spawn the player on
      var spawn_index = dungeonRand.RandInt(_valid_spawns_x2.length);
      dungeonGenerationInfo.player_spawn_x = _valid_spawns_x2[spawn_index];
      dungeonGenerationInfo.player_spawn_y = _valid_spawns_y2[spawn_index];
      OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SPAWN_PLAYER);
    }
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_SPAWN_NON_ENEMIES);
}
/**
 * NA: 02341470
 * SpawnEnemies - Spawns all enemies, including those in forced monster houses
 */
function SpawnEnemies(floor_props, is_empty_monster_house) {
  var valid_spawns_x = [],
    valid_spawns_y = [];
  var num_enemies;
  if (floor_props.enemy_density < 1) {
    //Negative means exact value
    num_enemies = Math.abs(floor_props.enemy_density);
  } else {
    //Positive means value with variance
    num_enemies = dungeonRand.RandRange(Math.floor(floor_props.enemy_density / 2), floor_props.enemy_density);
    if (num_enemies < 1) {
      num_enemies = 1;
    }
  }
  for (var x = 0; x < FLOOR_MAX_X; x++) {
    for (var y = 0; y < FLOOR_MAX_Y; y++) {
      // Enemies can spawn on tiles that are:
      // - Open Terrain
      // - In a room
      // - Not in a Kecleon Shop
      // - Don't have stairs, an item, or another enemy spawn
      // - Not a special tile that can't be broken by Absolute Mover
      // - Not where the player spawns
      // - Not in the monster house room
      if (dungeonData.list_tiles[x][y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[x][y].room_index !== 0xff && !dungeonData.list_tiles[x][y].terrain_flags.f_in_kecleon_shop && !dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_item && !dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_stairs && !dungeonData.list_tiles[x][y].terrain_flags.f_natural_junction && !dungeonData.list_tiles[x][y].terrain_flags.f_unbreakable) {
        if (dungeonGenerationInfo.player_spawn_x !== x || dungeonGenerationInfo.player_spawn_y !== y) {
          if (!statusData.no_enemy_spawn || dungeonGenerationInfo.monster_house_room !== dungeonData.list_tiles[x][y].room_index) {
            valid_spawns_x.push(x);
            valid_spawns_y.push(y);
          }
        }
      }
    }
  }
  if (valid_spawns_x.length > 0 && num_enemies + 1 > 0) {
    //Randomly select among the valid item spawn spots
    ShuffleSpawnPositions(valid_spawns_x, valid_spawns_y);
    num_enemies += 1;
    var cur_index = dungeonRand.RandInt(valid_spawns_x.length);
    for (var i = 0; i < num_enemies; i++) {
      var pos_x = valid_spawns_x[cur_index];
      var pos_y = valid_spawns_y[cur_index];
      cur_index++;
      if (cur_index === valid_spawns_x.length) {
        //Wrap around to the start
        cur_index = 0;
      }
      //Spawn an enemy here
      dungeonData.list_tiles[pos_x][pos_y].spawn_or_visibility_flags.f_monster = true;
    }
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SPAWN_NON_MONSTER_HOUSE_ENEMIES);
  }
  if (!dungeonGenerationInfo.force_create_monster_house) {
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_SPAWN_ENEMIES);
    return;
  }
  //This floor was marked to force a monster house
  //Place extra enemy spawns in the Monster House room
  valid_spawns_x = [];
  valid_spawns_y = [];
  var num_monster_house_spawn = generationConstants.max_number_monster_house_enemy_spawns;
  if (is_empty_monster_house) {
    //An "empty" monster house only spawns 3 enemies
    num_monster_house_spawn = 3;
  }
  if (dungeonGenerationInfo.force_create_monster_house) {
    num_monster_house_spawn = Math.floor(num_monster_house_spawn * 3 / 2);
  }
  for (var _x31 = 0; _x31 < FLOOR_MAX_X; _x31++) {
    for (var _y31 = 0; _y31 < FLOOR_MAX_Y; _y31++) {
      // Monster House enemies can spawn on tiles that are:
      // - Open Terrain
      // - In a room
      // - Not in a Kecleon Shop
      // - Don't have stairs, an item, or another enemy spawn
      // - Not a special tile that can't be broken by Absolute Mover
      // - Not where the player spawns
      // - Not in the monster house room
      if (dungeonData.list_tiles[_x31][_y31].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL && dungeonData.list_tiles[_x31][_y31].room_index !== 0xff && !dungeonData.list_tiles[_x31][_y31].terrain_flags.f_in_kecleon_shop && !dungeonData.list_tiles[_x31][_y31].terrain_flags.f_unbreakable && dungeonData.list_tiles[_x31][_y31].terrain_flags.f_in_monster_house) {
        if (dungeonGenerationInfo.player_spawn_x !== _x31 || dungeonGenerationInfo.player_spawn_y !== _y31) {
          valid_spawns_x.push(_x31);
          valid_spawns_y.push(_y31);
        }
      }
    }
  }
  if (valid_spawns_x.length > 0) {
    num_enemies = Math.max(1, dungeonRand.RandRange(Math.floor(7 * valid_spawns_x.length / 10), Math.floor(8 * valid_spawns_x.length / 10)));
    if (num_enemies >= num_monster_house_spawn) {
      //Don't spawn more enemies than the designated limit
      num_enemies = num_monster_house_spawn;
    }
    //Randomly select among the valid item spawn spots
    ShuffleSpawnPositions(valid_spawns_x, valid_spawns_y);
    var _cur_index4 = dungeonRand.RandInt(valid_spawns_x.length);
    for (var _i11 = 0; _i11 < num_enemies; _i11++) {
      var _pos_x4 = valid_spawns_x[_cur_index4];
      var _pos_y4 = valid_spawns_y[_cur_index4];
      _cur_index4++;
      if (_cur_index4 === valid_spawns_x.length) {
        //Wrap around to the start
        _cur_index4 = 0;
      }
      //Spawn an enemy here
      dungeonData.list_tiles[_pos_x4][_pos_y4].spawn_or_visibility_flags.f_monster = true;
    }
    OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MINOR, MinorGenerationType.GEN_TYPE_SPAWN_MONSTER_HOUSE_EXTRA_ENEMIES);
  }
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_MAJOR, MajorGenerationType.GEN_TYPE_SPAWN_ENEMIES);
}
/**
 * NA: 02340974
 * ResolveInvalidSpawns - Resolve any potentially invalid spawns on tiles.
 *
 * Obstacles can't spawn traps, impassable obstacles can't spawn items (you aren't able to reach them)
 *
 * A tile marked for the stairs must not have a trap there
 *
 * A tile marked for an item also must not have a trap there
 */
function ResolveInvalidSpawns() {
  for (var x = 0; x < FLOOR_MAX_X; x++) {
    for (var y = 0; y < FLOOR_MAX_Y; y++) {
      if (dungeonData.list_tiles[x][y].terrain_flags.terrain_type !== TerrainType.TERRAIN_NORMAL) {
        if (dungeonData.list_tiles[x][y].terrain_flags.f_impassable_wall && dungeonData.list_tiles[x][y].terrain_flags.f_unbreakable) {
          //This tile is an impassable obstacle, make sure no items spawn here
          dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_item = false;
        }
        //This tile is an obstacle, make sure no traps spawn here
        dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_trap = false;
      }
      if (dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_stairs) {
        //This tile has the stairs, make sure the stairs bit is set and
        //make sure no traps spawn here
        dungeonData.list_tiles[x][y].terrain_flags.f_stairs = true;
        dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_trap = false;
      }
      if (dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_item) {
        //This tile is an item spawn, make sure no traps spawn here
        dungeonData.list_tiles[x][y].spawn_or_visibility_flags.f_trap = false;
      }
    }
  }
}
/**
 * NA: 02341E6C
 * StairsAlwaysReachable - Checks that the stairs are always reachable from every walkable tile on the floor
 *
 * Uses a graph-traversal similar to Breadth-First Search (but with slightly different order due to how
 * iteration works))
 *
 * If any tile is walkable but wasn't reached, this function will return false.
 * If every tile was reached, this function will return true.
 */
function StairsAlwaysReachable(x_stairs, y_stairs, mark_unreachable) {
  var test = new Array(FLOOR_MAX_X);
  for (var x = 0; x < FLOOR_MAX_X; x++) {
    test[x] = new Array(FLOOR_MAX_Y);
    for (var y = 0; y < FLOOR_MAX_Y; y++) {
      test[x][y] = new StairsReachableFlags();
      if (mark_unreachable) {
        //Reset all unreachable flags on tiles, they'll be recomputed from scratch
        dungeonData.list_tiles[x][y].terrain_flags.f_unreachable_from_stairs = false;
      }
      if (dungeonData.list_tiles[x][y].terrain_flags.terrain_type !== TerrainType.TERRAIN_NORMAL) {
        if (!dungeonData.list_tiles[x][y].terrain_flags.f_corner_cuttable) {
          test[x][y].f_cannot_corner_cut = true;
        }
      }
      if (dungeonData.list_tiles[x][y].terrain_flags.terrain_type === TerrainType.TERRAIN_SECONDARY) {
        if (!dungeonData.list_tiles[x][y].terrain_flags.f_corner_cuttable) {
          test[x][y].f_secondary_terrain_cannot_corner_cut = true;
        }
      }
    }
  }
  test[x_stairs][y_stairs].f_starting_point = true;
  test[x_stairs][y_stairs].f_in_visit_queue = true;
  if (dungeonGenerationInfo.stairs_spawn_x !== x_stairs && dungeonGenerationInfo.stairs_spawn_y !== y_stairs) {
    return false;
  }
  statusData.num_tiles_reachable_from_stairs = 0;
  var count = 0;
  var checked = 1;
  // Uses a semi-BFS starting from the stairs until all reachable tiles
  // have been visited
  while (checked !== 0) {
    count += 1;
    checked = 0;
    for (var _x32 = 0; _x32 < FLOOR_MAX_X; _x32++) {
      for (var _y32 = 0; _y32 < FLOOR_MAX_Y; _y32++) {
        if (!test[_x32][_y32].f_visited && test[_x32][_y32].f_in_visit_queue) {
          test[_x32][_y32].f_in_visit_queue = false;
          test[_x32][_y32].f_visited = true;
          checked += 1;
          //Queue up in cardinal directions of this tile
          //Left
          if (_x32 > 0 && !test[_x32 - 1][_y32].f_cannot_corner_cut && !test[_x32 - 1][_y32].f_secondary_terrain_cannot_corner_cut && !test[_x32 - 1][_y32].f_visited) {
            test[_x32 - 1][_y32].f_in_visit_queue = true;
          }
          //Up
          if (_y32 > 0 && !test[_x32][_y32 - 1].f_cannot_corner_cut && !test[_x32][_y32 - 1].f_secondary_terrain_cannot_corner_cut && !test[_x32][_y32 - 1].f_visited) {
            test[_x32][_y32 - 1].f_in_visit_queue = true;
          }
          //Right
          if (_x32 < FLOOR_MAX_X - 1 && !test[_x32 + 1][_y32].f_cannot_corner_cut && !test[_x32 + 1][_y32].f_secondary_terrain_cannot_corner_cut && !test[_x32 + 1][_y32].f_visited) {
            test[_x32 + 1][_y32].f_in_visit_queue = true;
          }
          //Down
          if (_y32 < FLOOR_MAX_Y - 1 && !test[_x32][_y32 + 1].f_cannot_corner_cut && !test[_x32][_y32 + 1].f_secondary_terrain_cannot_corner_cut && !test[_x32][_y32 + 1].f_visited) {
            test[_x32][_y32 + 1].f_in_visit_queue = true;
          }
          //Note:
          //For corner directions, checks are also made on the 3rd bit
          //of the test array, but this value is never assigned
          //I have removed this check here since its use is unclear.
          //(This should not change behavior)
          //Up-left
          if (_x32 > 0 && _y32 > 0 && !test[_x32 - 1][_y32 - 1].f_cannot_corner_cut && !test[_x32 - 1][_y32 - 1].f_secondary_terrain_cannot_corner_cut && !test[_x32 - 1][_y32 - 1].f_unknown_field_0x2 && !test[_x32 - 1][_y32 - 1].f_visited && !test[_x32][_y32 - 1].f_cannot_corner_cut && !test[_x32 - 1][_y32].f_cannot_corner_cut) {
            test[_x32 - 1][_y32 - 1].f_in_visit_queue = true;
          }
          //Up-Right
          if (_x32 < FLOOR_MAX_X - 1 && _y32 > 0 && !test[_x32 + 1][_y32 - 1].f_cannot_corner_cut && !test[_x32 + 1][_y32 - 1].f_secondary_terrain_cannot_corner_cut && !test[_x32 + 1][_y32 - 1].f_unknown_field_0x2 && !test[_x32 + 1][_y32 - 1].f_visited && !test[_x32][_y32 - 1].f_cannot_corner_cut && !test[_x32 + 1][_y32].f_cannot_corner_cut) {
            test[_x32 + 1][_y32 - 1].f_in_visit_queue = true;
          }
          //Down-left
          if (_x32 > 0 && _y32 < FLOOR_MAX_Y - 1 && !test[_x32 - 1][_y32 + 1].f_cannot_corner_cut && !test[_x32 - 1][_y32 + 1].f_secondary_terrain_cannot_corner_cut && !test[_x32 - 1][_y32 + 1].f_unknown_field_0x2 && !test[_x32 - 1][_y32 + 1].f_visited && !test[_x32][_y32 + 1].f_cannot_corner_cut && !test[_x32 - 1][_y32].f_cannot_corner_cut) {
            test[_x32 - 1][_y32 + 1].f_in_visit_queue = true;
          }
          //Down-right
          if (_x32 < FLOOR_MAX_X - 1 && _y32 < FLOOR_MAX_Y - 1 && !test[_x32 + 1][_y32 + 1].f_cannot_corner_cut && !test[_x32 + 1][_y32 + 1].f_secondary_terrain_cannot_corner_cut && !test[_x32 + 1][_y32 + 1].f_unknown_field_0x2 && !test[_x32 + 1][_y32 + 1].f_visited && !test[_x32][_y32 + 1].f_cannot_corner_cut && !test[_x32 + 1][_y32].f_cannot_corner_cut) {
            test[_x32 + 1][_y32 + 1].f_in_visit_queue = true;
          }
        }
      }
    }
  }
  statusData.num_tiles_reachable_from_stairs = count;
  for (var _x33 = 0; _x33 < FLOOR_MAX_X; _x33++) {
    for (var _y33 = 0; _y33 < FLOOR_MAX_Y; _y33++) {
      if (!test[_x33][_y33].f_cannot_corner_cut && !test[_x33][_y33].f_secondary_terrain_cannot_corner_cut && !test[_x33][_y33].f_unknown_field_0x2 && !test[_x33][_y33].f_visited) {
        //This is an open tile that wasn't visited by BFS, which means it's unreachable
        //from the starting stairs
        if (mark_unreachable) {
          dungeonData.list_tiles[_x33][_y33].terrain_flags.f_unreachable_from_stairs = true;
        } else {
          //unbreakable tiles can't really be navigated onto anyways, so if
          //we can ignore the tile (otherwise it's a problem!)
          if (!dungeonData.list_tiles[_x33][_y33].terrain_flags.f_unbreakable) {
            return false;
          }
        }
      }
    }
  }
  return true;
}
/**
 * NA: 0233A6D8
 * GenerateFloor - The Master Function for generating a dungeon floor
 *
 * Runs based on 3 loop levels of safety
 *
 * Innermost Loop: 32 attempts for deciding the maximum rooms in each dimension for the floor
 * 		- The dimensions are capped at 6x4 (but we can randomize outside this range and fail)
 * 		- Must maintain a certain number of tiles per grid cell in both dimensions
 * 		- If this loop fails 32 times, defaults to a 4x4 maximum
 *
 * Inner Main Loop: 10 attempts for the main layout of a floor
 * 		- This loop can fail by being marked invalid during generation
 * 		- Or, it can fail by having < 2 rooms or < 20 room tiles
 * 		- This occurs prior to secondary terrain generation
 * 		- If the loop fails 10 times, defaults to generating a One-Room Monster House
 *
 * Outermost Loop: 10 attempts for everything involved in generating a layout
 * 		- This is where secondary terrain generation and junction additions takes place
 * 		- This loop can fail during spawn location verification (can you get to the stairs?)
 * 		- If the loop fails 10 times, defaults to generating a One-Room Monster House
 */
function GenerateFloor(floor_props) {
  //TODO: Continue early GenerateFloor operations
  //dungeonData.field_0x12aa4 = false;
  //dungeonData.field_0x3fc2 = false;
  //LoadFixedRoomDataVeneer();
  //value from fixed room data function call
  //dungeonData.field_0x12aa4 = that value;
  /*
    statusData.has_kecleon_shop = false;
    statusData.has_monster_house = false;
    statusData.has_maze = false;
        ResetHiddenStairsSpawn();
    statusData.no_enemy_spawn = IsOutlawMonsterHouseFloor();
    statusData.hidden_stairs_type = GetHiddenStairsType();
        if(Constants.SECONDARY_TERRAIN_TYPES[statusData.tileset_id] === SecondaryTerrainType.SECONDARY_TERRAIN_CHASM)
    {
        statusData.has_chasms_as_secondary_terrain = true;
    }
    else
    {
        statusData.has_chasms_as_secondary_terrain = false;
    }*/
  statusData.stairs_room_index = 0xff;
  statusData.floor_size = FloorSize.FLOOR_SIZE_LARGE;
  dungeonGenerationInfo.fixed_room_id = floor_props.fixed_room_id;
  statusData.monster_house_chance = floor_props.monster_house_chance;
  statusData.kecleon_shop_chance = floor_props.kecleon_shop_chance;
  statusData.secondary_structures_budget = floor_props.secondary_structures_budget;
  statusData.hidden_stairs_type = floor_props.hidden_stairs_type;
  var spawn_attempts;
  for (spawn_attempts = 0; spawn_attempts < 10; spawn_attempts++) {
    dungeonGenerationInfo.player_spawn_x = -1;
    dungeonGenerationInfo.player_spawn_y = -1;
    dungeonGenerationInfo.stairs_spawn_x = -1;
    dungeonGenerationInfo.stairs_spawn_y = -1;
    dungeonGenerationInfo.hidden_stairs_spawn_x = -1;
    dungeonGenerationInfo.hidden_stairs_spawn_y = -1;
    var fixed_room = false;
    var secondary_gen = false;
    //
    // Actual generation attempts, up to 10 times per entity
    var gen_attempts = void 0;
    for (gen_attempts = 0; gen_attempts < 10; gen_attempts++) {
      if (fixed_room) {
        // Check for a full-floor fixed room, if this is the case, generation is done.
        // 0xA5 is the first non-full-floor fixed room ID (which corresponds to Sealed Chambers)
        if (dungeonGenerationInfo.fixed_room_id > 0 && dungeonGenerationInfo.fixed_room_id < 0xa5) break;
        fixed_room = false;
      }
      dungeonGenerationInfo.floor_generation_attempts = gen_attempts;
      // If we fail layout generation once, turn off secondary structures for the remaining generations
      if (gen_attempts > 0) {
        statusData.secondary_structures_budget = 0;
      }
      statusData.is_invalid = false;
      statusData.kecleon_shop_middle_x = -1;
      statusData.kecleon_shop_middle_y = -1;
      ResetFloor();
      dungeonGenerationInfo.player_spawn_x = -1;
      dungeonGenerationInfo.player_spawn_y = -1;
      /* TODO: Continue fixed room support
            if (dungeonGenerationInfo.fixed_floor_number !== 0) {
                // Special handling for fixed rooms
                        if (!ProcessFixedRoom(dungeonGenerationInfo.fixed_floor_number, floor_props)) {
                    fixed_room = true;
                            break; //This would actually be a goto skipping layout generation
                }
            }*/
      var grid_size_x = 2; //[r13, #+0x8]
      var grid_size_y = 2; //[r13, #+0x4]
      // Attempt to generate random grid dimensions
      var attempts = 32;
      while (attempts > 0) {
        var max_x = void 0,
          max_y = void 0;
        if (floor_props.layout === FloorLayout.LAYOUT_LARGE_0x8) {
          max_x = 5;
          max_y = 4;
        } else {
          max_x = 9;
          max_y = 8;
        }
        grid_size_x = dungeonRand.RandRange(2, max_x);
        grid_size_y = dungeonRand.RandRange(2, max_y);
        // Limit overall dimensions
        if (grid_size_x <= 6 && grid_size_y <= 4) break;
        attempts--;
      }
      // We failed to generate random grid dimensions, default to 4x4
      if (attempts === 0) {
        grid_size_x = 4;
        grid_size_y = 4;
      }
      // Make sure there are at least 7 tiles per grid cell in both
      // dimensions. Otherwise, the grid size is too big so default to 1
      if (Math.floor(FLOOR_MAX_X / grid_size_x) < 8) {
        grid_size_x = 1;
      }
      if (Math.floor(FLOOR_MAX_Y / grid_size_y) < 8) {
        grid_size_y = 1;
      }
      statusData.layout = floor_props.layout;
      switch (floor_props.layout) {
        case FloorLayout.LAYOUT_LARGE:
        case FloorLayout.LAYOUT_LARGE_0x8:
        default:
          GenerateStandardFloor(grid_size_x, grid_size_y, floor_props);
          secondary_gen = true;
          break;
        case FloorLayout.LAYOUT_SMALL:
          grid_size_x = 4;
          grid_size_y = dungeonRand.RandInt(2) + 2;
          statusData.floor_size = FloorSize.FLOOR_SIZE_SMALL;
          GenerateStandardFloor(grid_size_x, grid_size_y, floor_props);
          secondary_gen = true;
          break;
        case FloorLayout.LAYOUT_ONE_ROOM_MONSTER_HOUSE:
          GenerateOneRoomMonsterHouseFloor();
          dungeonGenerationInfo.force_create_monster_house = true;
          break;
        case FloorLayout.LAYOUT_OUTER_RING:
          GenerateOuterRingFloor(floor_props);
          secondary_gen = true;
          break;
        case FloorLayout.LAYOUT_CROSSROADS:
          GenerateCrossroadsFloor(floor_props);
          secondary_gen = true;
          break;
        case FloorLayout.LAYOUT_TWO_ROOMS_WITH_MONSTER_HOUSE:
          GenerateTwoRoomsWithMonsterHouseFloor();
          dungeonGenerationInfo.force_create_monster_house = true;
          break;
        case FloorLayout.LAYOUT_LINE:
          GenerateLineFloor(floor_props);
          secondary_gen = true;
          break;
        case FloorLayout.LAYOUT_CROSS:
          GenerateCrossFloor(floor_props);
          break;
        case FloorLayout.LAYOUT_BEETLE:
          GenerateBeetleFloor(floor_props);
          break;
        case FloorLayout.LAYOUT_OUTER_ROOMS:
          GenerateOuterRoomsFloor(grid_size_x, grid_size_y, floor_props);
          secondary_gen = true;
          break;
        case FloorLayout.LAYOUT_MEDIUM:
          grid_size_x = 4;
          grid_size_y = dungeonRand.RandInt(2) + 2;
          statusData.floor_size = FloorSize.FLOOR_SIZE_MEDIUM;
          GenerateStandardFloor(grid_size_x, grid_size_y, floor_props);
          secondary_gen = true;
          break;
      }
      ResetInnerBoundaryTileRows();
      EnsureImpassableTilesAreWalls();
      // Nothing failed during generation
      if (!statusData.is_invalid) {
        //We need to make sure there are at least 2 rooms with at least 20 total tiles
        var room = new Array(64).fill(false);
        var room_tiles = 0;
        for (var x = 0; x < FLOOR_MAX_X; x++) {
          for (var y = 0; y < FLOOR_MAX_Y; y++) {
            if (dungeonData.list_tiles[x][y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
              if (dungeonData.list_tiles[x][y].room_index < 0xf0) {
                room_tiles++;
                if (dungeonData.list_tiles[x][y].room_index < 0x40) {
                  room[dungeonData.list_tiles[x][y].room_index] = true;
                }
              }
            }
          }
        }
        var num_rooms = room.filter(function (room) {
          return room;
        }).length;
        if (num_rooms >= 2 && room_tiles >= 20) break; //This layout is good!
      }
      //This layout is bad! We need to try again
    }
    //If we fail to generate a layout in 10 attempts, just abort and make a one-room Monster House
    if (gen_attempts === 10) {
      statusData.kecleon_shop_middle_x = -1;
      statusData.kecleon_shop_middle_y = -1;
      GenerateOneRoomMonsterHouseFloor();
      dungeonGenerationInfo.force_create_monster_house = true;
    }
    //We will be guaranteed to have a good layout by this point
    FinalizeJunctions();
    if (secondary_gen) {
      GenerateSecondaryTerrainFormations(true, floor_props);
    }
    //OnCompleteGenerationStep("Finalize Junctions and Generate Secondary Terrain Formations");
    var is_empty_monster_house = dungeonRand.RandInt(100) < floor_props.itemless_monster_house_chance;
    SpawnNonEnemies(floor_props, is_empty_monster_house);
    SpawnEnemies(floor_props, is_empty_monster_house);
    ResolveInvalidSpawns(); //Make sure multiple flags aren't set for one tile
    //OnCompleteGenerationStep("Spawn Entities and Resolve Invalid Spawns");
    if (dungeonGenerationInfo.player_spawn_x !== -1 && dungeonGenerationInfo.player_spawn_y !== -1) {
      // This is for normal fixed rooms, we don't need to validate the stairs in this scenario
      // Since it's fixed already
      if (GetFloorType() === FloorType.FLOOR_TYPE_FIXED) break;
      if (dungeonGenerationInfo.stairs_spawn_x !== -1 && dungeonGenerationInfo.stairs_spawn_y !== -1) {
        // We can reach the stairs, we're good!
        if (StairsAlwaysReachable(dungeonGenerationInfo.stairs_spawn_x, dungeonGenerationInfo.stairs_spawn_y, false)) break;
      }
      //Something went bad with spawns, we'll need to retry on a new generation
    }
    //If we fail with spawns (or otherwise) 10 times, opt for a One-Room Monster House generation
    if (spawn_attempts + 1 === 10) {
      statusData.kecleon_shop_middle_x = -1;
      statusData.kecleon_shop_middle_y = -1;
      ResetFloor();
      GenerateOneRoomMonsterHouseFloor();
      dungeonGenerationInfo.force_create_monster_house = true;
      FinalizeJunctions();
      SpawnNonEnemies(floor_props, false);
      SpawnEnemies(floor_props, false);
      ResolveInvalidSpawns();
      //We don't care about validating because this is our bailout, so we're done!
    }
  }
  //TODO: Integrate late GenerateFloor operations
  OnCompleteGenerationStep(GenerationStepLevel.GEN_STEP_COMPLETE, MajorGenerationType.GEN_TYPE_GENERATE_FLOOR);
  return dungeonData.list_tiles;
}
/**
 * OnCompleteGenerationStep - responsible for mid-generation dungeon progression if additional output is desired
 */
function OnCompleteGenerationStep(generation_step_level, generation_type) {
  //Check if the event is at or below the threshold we've set for accepting callbacks
  if (generationCallbackFrequency >= generation_step_level && typeof dungeonGenerationCallback === 'function') {
    dungeonGenerationCallback(generation_step_level, generation_type, dungeonData, dungeonGenerationInfo, statusData, grid_cell_start_x, grid_cell_start_y);
  }
}
/**
 * GenerateDungeon - Entry function provided to generate a dungeon floor (not part of the original code)
 *
 * @param floor_props - Primary properties of the floor, such as its room density or floor connectivity.
 * @param dungeon_data - Properties of the Dungeon we're in, such as what dungeon we're in or if we're doing a mission.
 * @param generation_constants - Modifications to the vanilla values for constants like the chance to merge rooms.
 * @param advanced_generation_settings - Modifications and patches to dungeon algorithm bugs / other advanced functionality
 * @param dungeon_generation_callback - A callback function to provide all information on the steps of generation as the algorithm progresses,
 * 										it will be called based on the the frequency specified in generation_callback_frequency
 * @param generation_callback_frequency - Determines how often to call the callback function. By default this will only be for the final generated layout,
 * 									 but this can be modified to include major generation events (ex. Generating all hallways on a floor) or minor generation
 * 									 events (ex. Generating a single hallway on the floor).
 * @returns The dungeon tile map for the final generated floor.
 */
function GenerateDungeon(floor_props, dungeon_data, generation_constants, advanced_generation_settings, dungeon_generation_callback, generation_callback_frequency) {
  //We want to make this a deep copy, otherwise changes to dungeonData will leak to the original reference
  //(we also really don't want the map stored there unknowingly).
  dungeonData = JSON.parse(JSON.stringify(dungeon_data));
  dungeonGenerationInfo = new DungeonGenerationInfo();
  statusData = new FloorGenerationStatus();
  dungeonRand = new DungeonRandom();
  if (typeof generation_constants !== 'undefined') {
    generationConstants = generation_constants;
  } else {
    generationConstants = new GenerationConstants();
  }
  if (typeof advanced_generation_settings !== 'undefined') {
    advancedGenerationSettings = advanced_generation_settings;
  } else {
    advancedGenerationSettings = new AdvancedGenerationSettings();
  }
  if (typeof dungeon_generation_callback !== 'undefined') {
    dungeonGenerationCallback = dungeon_generation_callback;
  }
  if (typeof generation_callback_frequency !== 'undefined') {
    generationCallbackFrequency = generation_callback_frequency;
  } else {
    generationCallbackFrequency = GenerationStepLevel.GEN_STEP_COMPLETE;
  }
  return GenerateFloor(floor_props);
}

function CreateMapString(map, list_x, list_y) {
  var map_string = '';
  var x_idx = 0,
    y_idx = 0,
    on_x_border = false,
    on_y_border = false;
  for (var y = 0; y < 32; y++) {
    var mapLine = '';
    if (list_y && y_idx < list_y.length && y >= list_y[y_idx] - 1) {
      if (y >= list_y[y_idx]) {
        y_idx++;
      }
      on_y_border = true;
    } else {
      on_y_border = false;
    }
    x_idx = 0;
    for (var x = 0; x < 56; x++) {
      if (list_x && x_idx < list_x.length && x >= list_x[x_idx] - 1) {
        if (x >= list_x[x_idx]) {
          x_idx++;
        }
        on_x_border = true;
      } else {
        on_x_border = false;
      }
      if (x > 0) {
        mapLine += ' ';
      }
      if (map[x][y].terrain_flags.terrain_type === TerrainType.TERRAIN_NORMAL) {
        if (map[x][y].spawn_or_visibility_flags.f_stairs) {
          mapLine += '=';
        } else if (map[x][y].terrain_flags.f_in_kecleon_shop) {
          mapLine += 'K';
        } else if (map[x][y].spawn_or_visibility_flags.f_item) {
          mapLine += 'I';
        } else if (map[x][y].spawn_or_visibility_flags.f_monster) {
          mapLine += 'M';
        } else if (map[x][y].spawn_or_visibility_flags.f_trap) {
          mapLine += 'T';
        } else {
          if (map[x][y].room_index === 0xff) {
            //Not a room
            mapLine += 'P';
          } else if (map[x][y].room_index === 0xfe) {
            //Hallway Anchor
            mapLine += 'A';
          } else {
            //a room
            if (map[x][y].terrain_flags.f_in_monster_house) {
              mapLine += 'Z';
            } else {
              mapLine += 'X';
            }
          }
        }
      } else if (map[x][y].terrain_flags.terrain_type === TerrainType.TERRAIN_WALL) {
        if (on_x_border || on_y_border) {
          //flags signal we're on a grid cell border
          mapLine += '\\';
        } else {
          mapLine += '-';
        }
      } else if (map[x][y].terrain_flags.terrain_type === TerrainType.TERRAIN_SECONDARY) {
        mapLine += 'v';
      } else if (map[x][y].terrain_flags.terrain_type === TerrainType.TERRAIN_CHASM) {
        mapLine += 'C';
      }
    }
    map_string += mapLine + '\n';
  }
  return map_string;
}

export { AdvancedGenerationSettings, CORNER_CARDINAL_NEIGHBOR_EXPECT_OPEN, CardinalDirection, CreateMapString, DirectionId, Dungeon, DungeonGenerationInfo, DungeonObjectiveType, FloorGenerationStatus, FloorLayout, FloorProperties, FloorSize, FloorType, GenerateDungeon, GenerationConstants, GenerationStepLevel, GridCell, HiddenStairsType, LIST_DIRECTIONS, MajorGenerationType, MinorGenerationType, MissionDestinationInfo, MissionSubtypeChallenge, MissionSubtypeExplore, MissionSubtypeOutlaw, MissionSubtypeTakeItem, MissionType, RoomFlags, SECONDARY_TERRAIN_TYPES, SecondaryStructureType, SecondaryTerrainType, SpawnFlags, StairsReachableFlags, TerrainFlags, TerrainType, Tile };
