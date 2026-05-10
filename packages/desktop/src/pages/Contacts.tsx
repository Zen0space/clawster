import { writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { Contacts as SharedContacts, type SaveFile } from "@clawster/shared";

const saveFile: SaveFile = async (filename, bytes) => {
  await writeFile(filename, bytes, { baseDir: BaseDirectory.Download });
};

export function Contacts() {
  return <SharedContacts saveFile={saveFile} />;
}
