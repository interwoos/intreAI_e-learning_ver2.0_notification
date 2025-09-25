import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}'),
  scopes: SCOPES,
});

export const sheets = google.sheets({ version: 'v4', auth });
export const drive = google.drive({ version: 'v3', auth });

/** URLからスプレッドシートIDを抽出 */
export function extractSpreadsheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

/** URLからDriveフォルダIDを抽出 */
export function extractDriveFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

/** テンプレートから新しいスプレッドシートを作成 */
export async function createSpreadsheetFromTemplate(
  templateId: string,
  newName: string,
  folderId: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const actualTemplateId = extractSpreadsheetId(templateId) || templateId;
  const actualFolderId = extractDriveFolderId(folderId) || folderId;

  await auth.getClient();

  try {
    // 1) コピー
    const copyRes = await drive.files.copy({
      fileId: actualTemplateId,
      requestBody: { name: newName, parents: [actualFolderId] },
    });
    const newSpreadsheetId = copyRes.data.id;
    if (!newSpreadsheetId) throw new Error('スプレッドシートIDが返ってきません');

    // 2) 誰でも編集（元の挙動を維持）
    await drive.permissions.create({
      fileId: newSpreadsheetId,
      requestBody: { role: 'writer', type: 'anyone' },
    });

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${newSpreadsheetId}/edit`;
    return { spreadsheetId: newSpreadsheetId, spreadsheetUrl };

  } catch (e: any) {
    const reason =
      e?.response?.data?.error?.errors?.[0]?.reason ||
      e?.errors?.[0]?.reason || '';
    const code = e?.response?.data?.error?.code || e?.code;
    console.error('[Drive copy error]', { code, reason, msg: e?.message });
    throw e;
  }
}

/** シートID一覧を取得 */
export async function getSheetIds(spreadsheetId: string): Promise<Record<string, string>> {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const map: Record<string, string> = {};
  (res.data.sheets || []).forEach((sheet) => {
    const title = sheet.properties?.title;
    const gid = sheet.properties?.sheetId?.toString();
    if (title && gid) map[title] = gid;
  });
  return map;
}

/** 講義構造を解析 */
export async function analyzeLectureStructure(templateUrl: string): Promise<LectureConfig> {
  const templateId = extractSpreadsheetId(templateUrl);
  if (!templateId) {
    throw new Error('無効なテンプレートURLです');
  }

  console.log('📊 講義構造解析開始:', templateId);

  try {
    const res = await sheets.spreadsheets.get({ 
      spreadsheetId: templateId,
      fields: 'sheets.properties(title,sheetId)'
    });

    const allTasks: TaskInfo[] = [];
    const lectureMap = new Map<number, TaskInfo[]>();

    (res.data.sheets || []).forEach(sheet => {
      const title = sheet.properties?.title;
      if (!title) return;

      const match = title.match(/^【(\d+)-(\d+)】(.+)$/);
      if (match) {
        const lectureNumber = parseInt(match[1], 10);
        const subTaskNumber = parseInt(match[2], 10);
        const taskTitle = match[3].trim();
        const taskId = `${lectureNumber}-${subTaskNumber}`;

        const taskInfo: TaskInfo = {
          taskId,
          title: taskTitle,
          lectureNumber,
          subTaskNumber
        };

        allTasks.push(taskInfo);
        if (!lectureMap.has(lectureNumber)) {
          lectureMap.set(lectureNumber, []);
        }
        lectureMap.get(lectureNumber)!.push(taskInfo);
      }
    });

    const totalLectures = allTasks.length > 0 
      ? Math.max(...allTasks.map(task => task.lectureNumber))
      : 0;

    const lectures: LectureStructure[] = [];
    for (let i = 1; i <= totalLectures; i++) {
      const tasks = lectureMap.get(i) || [];
      tasks.sort((a, b) => a.subTaskNumber - b.subTaskNumber);
      lectures.push({ lectureNumber: i, tasks });
    }

    allTasks.sort((a, b) => {
      if (a.lectureNumber !== b.lectureNumber) {
        return a.lectureNumber - b.lectureNumber;
      }
      return a.subTaskNumber - b.subTaskNumber;
    });

    return { totalLectures, lectures, allTasks };

  } catch (error: any) {
    console.error('❌ 講義構造解析エラー:', error);
    
    if (error.code === 404) {
      throw new Error('スプレッドシートが見つかりません。URLを確認してください。');
    } else if (error.code === 403) {
      throw new Error('スプレッドシートへのアクセス権限がありません。');
    } else {
      throw new Error(`講義構造の解析に失敗しました: ${error.message}`);
    }
  }
}

/** 動的コースデータ生成 */
export function generateCourseData(lectureConfig: LectureConfig) {
  return lectureConfig.lectures.map(lecture => ({
    id: lecture.lectureNumber,
    title: `第${lecture.lectureNumber}回講義`,
    videoTabs: [],
    subThemes: lecture.tasks.map(task => ({
      id: task.taskId,
      title: task.title
    }))
  }));
}

/** A5セルに動画リンクを貼る */
export async function writeVideoLinkToA5(
  spreadsheetId: string,
  sheetName: string,
  link: string
) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A5`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[`=HYPERLINK("${link}", "動画リンク")`]],
    },
  });
  console.log(`✅ ${sheetName}!A5 に動画リンクを書き込みました`);
}

/** 型定義 */
export interface TaskInfo {
  taskId: string;
  title: string;
  lectureNumber: number;
  subTaskNumber: number;
}

export interface LectureStructure {
  lectureNumber: number;
  tasks: TaskInfo[];
}

export interface LectureConfig {
  totalLectures: number;
  lectures: LectureStructure[];
  allTasks: TaskInfo[];
}
