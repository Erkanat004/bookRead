package com.lumi.reader;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.AtomicFile;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** App-private PDF copies. No broad storage permission, no base64 bridge payloads. */
@CapacitorPlugin(name = "LumiFiles")
public class LumiFilesPlugin extends Plugin {
    private static final long MAX_SIZE = 512L * 1024 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private boolean picking = false;

    private File booksDir() throws Exception {
        File dir = new File(getContext().getFilesDir(), "books");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("Не удалось создать папку книг.");
        return dir;
    }
    private File bookFile(String id) throws Exception {
        if (id == null || !id.matches("[a-zA-Z0-9-]{1,80}")) throw new Exception("Некорректный идентификатор книги.");
        return new File(booksDir(), id + ".pdf");
    }
    private AtomicFile libraryFile() {
        return new AtomicFile(new File(getContext().getFilesDir(), "library.json"));
    }

    @PluginMethod public void pick(PluginCall call) {
        if (picking) { call.reject("Выбор файла уже открыт."); return; }
        picking = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
        try { startActivityForResult(call, intent, "picked"); }
        catch (Exception e) { picking = false; call.reject("Не удалось открыть выбор файлов.", e); }
    }

    @ActivityCallback private void picked(PluginCall call, ActivityResult result) {
        picking = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Выбор отменён.", "CANCELLED"); return;
        }
        Uri uri = result.getData().getData();
        io.execute(() -> {
            File temporary = null;
            File target = null;
            try {
                String name = "Книга.pdf";
                long declaredSize = -1;
                try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int ni = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        int si = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (ni >= 0 && !cursor.isNull(ni)) name = cursor.getString(ni);
                        if (si >= 0 && !cursor.isNull(si)) declaredSize = cursor.getLong(si);
                    }
                }
                if (declaredSize > MAX_SIZE) throw new Exception("Максимальный размер книги — 512 МБ.");
                if (declaredSize > 0 && booksDir().getUsableSpace() < declaredSize + 16L * 1024 * 1024) throw new Exception("Недостаточно свободной памяти для копии книги.");
                String id = UUID.randomUUID().toString();
                target = bookFile(id);
                temporary = new File(booksDir(), id + ".part");
                long size = 0;
                byte[] header = new byte[1024];
                int headerLength = 0;
                try (InputStream input = getContext().getContentResolver().openInputStream(uri);
                     FileOutputStream output = new FileOutputStream(temporary)) {
                    if (input == null) throw new Exception("Не удалось прочитать PDF.");
                    byte[] buffer = new byte[64 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        size += count;
                        if (size > MAX_SIZE) throw new Exception("Максимальный размер книги — 512 МБ.");
                        if (headerLength < header.length) {
                            int length = Math.min(count, header.length - headerLength);
                            System.arraycopy(buffer, 0, header, headerLength, length);
                            headerLength += length;
                        }
                        output.write(buffer, 0, count);
                    }
                    output.getFD().sync();
                }
                if (!new String(header, 0, headerLength, StandardCharsets.ISO_8859_1).contains("%PDF-")) throw new Exception("Выбранный файл не является PDF.");
                if (!temporary.renameTo(target)) throw new Exception("Не удалось сохранить PDF.");
                JSObject data = new JSObject();
                data.put("id", id); data.put("name", name); data.put("size", size);
                call.resolve(data);
            } catch (Exception e) {
                if (temporary != null) temporary.delete();
                if (target != null) target.delete();
                call.reject(e.getMessage() == null ? "Ошибка импорта PDF." : e.getMessage(), e);
            }
        });
    }

    @PluginMethod public void locate(PluginCall call) {
        try {
            File file = bookFile(call.getString("id"));
            if (!file.isFile()) throw new Exception("Файл книги не найден. Добавьте PDF заново.");
            JSObject result = new JSObject();
            result.put("url", getBridge().getLocalUrl() + "/_lumi_pdf_/" + call.getString("id"));
            call.resolve(result);
        } catch (Exception e) { call.reject(e.getMessage(), e); }
    }
    @PluginMethod public void remove(PluginCall call) {
        io.execute(() -> {
            try {
                File file = bookFile(call.getString("id"));
                if (file.exists() && !file.delete()) throw new Exception("Не удалось удалить локальный файл.");
                call.resolve();
            } catch (Exception e) { call.reject(e.getMessage(), e); }
        });
    }
    @PluginMethod public void load(PluginCall call) {
        io.execute(() -> {
            try {
                AtomicFile file = libraryFile();
                File base = file.getBaseFile();
                boolean exists = base.exists() || new File(base.getPath() + ".bak").exists();
                String json = exists ? new String(file.readFully(), StandardCharsets.UTF_8) : "";
                JSObject result = new JSObject(); result.put("json", json); call.resolve(result);
            } catch (Exception e) { call.reject("Не удалось прочитать библиотеку.", e); }
        });
    }
    @PluginMethod public void save(PluginCall call) {
        final String json = call.getString("json");
        if (json == null) { call.reject("Нет данных для сохранения."); return; }
        io.execute(() -> {
            AtomicFile file = libraryFile();
            FileOutputStream stream = null;
            try {
                stream = file.startWrite();
                stream.write(json.getBytes(StandardCharsets.UTF_8));
                file.finishWrite(stream); call.resolve();
            } catch (Exception e) {
                if (stream != null) file.failWrite(stream);
                call.reject("Не удалось сохранить библиотеку. Проверьте свободную память.", e);
            }
        });
    }
    public void requestBack() { notifyListeners("back", new JSObject()); }
    @PluginMethod public void exit(PluginCall call) {
        call.resolve(); getActivity().runOnUiThread(() -> getActivity().finish());
    }
    @Override protected void handleOnDestroy() { io.shutdown(); }
}

