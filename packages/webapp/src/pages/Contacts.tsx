import { Contacts as SharedContacts, type SaveFile } from "@clawster/shared";
import { saveBlob } from "../lib/saveBlob";

const saveFile: SaveFile = async (filename, bytes, mime) => {
  saveBlob(filename, bytes, mime);
};

export function Contacts() {
  return <SharedContacts saveFile={saveFile} />;
}
