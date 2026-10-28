package com.lumi.reader;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.util.HashMap;
import java.util.Map;

/** Serves private PDFs directly to WebView with real byte ranges, without a socket/server. */
public class LumiWebViewClient extends BridgeWebViewClient {
    private final File books;
    private final Uri origin;
    private static final String PREFIX = "/_lumi_pdf_/";

    public LumiWebViewClient(Bridge bridge) {
        super(bridge);
        books = new File(bridge.getContext().getFilesDir(), "books");
        origin = Uri.parse(bridge.getLocalUrl());
    }

    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String path = uri.getPath();
        if (path == null || !path.startsWith(PREFIX) || !origin.getHost().equals(uri.getHost()) || !origin.getScheme().equals(uri.getScheme())) {
            return super.shouldInterceptRequest(view, request);
        }
        String id = path.substring(PREFIX.length());
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("X-Content-Type-Options", "nosniff");
        if (!id.matches("[a-zA-Z0-9-]{1,80}") || !"GET".equals(request.getMethod())) return empty(404, "Not Found", headers);
        File file = new File(books, id + ".pdf");
        if (!file.isFile()) return empty(404, "Not Found", headers);
        long size = file.length();
        headers.put("Accept-Ranges", "bytes");
        long start = 0, end = size - 1;
        String range = null;
        for (Map.Entry<String, String> h : request.getRequestHeaders().entrySet()) {
            if (h.getKey().equalsIgnoreCase("Range")) range = h.getValue();
        }
        try {
            if (range != null) {
                if (!range.matches("bytes=\\d+-\\d*")) throw new IllegalArgumentException();
                String[] parts = range.substring(6).split("-", -1);
                start = Long.parseLong(parts[0]);
                if (!parts[1].isEmpty()) end = Math.min(end, Long.parseLong(parts[1]));
            }
            if (start < 0 || start >= size || end < start) throw new IllegalArgumentException();
            long length = end - start + 1;
            headers.put("Content-Length", Long.toString(length));
            if (range != null) headers.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
            return new WebResourceResponse("application/pdf", null, range == null ? 200 : 206, range == null ? "OK" : "Partial Content", headers, new Slice(file, start, length));
        } catch (IllegalArgumentException e) {
            headers.put("Content-Range", "bytes */" + size);
            return empty(416, "Range Not Satisfiable", headers);
        } catch (IOException e) {
            return empty(404, "Not Found", headers);
        }
    }
    private static WebResourceResponse empty(int code, String reason, Map<String, String> headers) {
        headers.put("Content-Length", "0");
        return new WebResourceResponse("application/pdf", null, code, reason, headers, new ByteArrayInputStream(new byte[0]));
    }
    private static class Slice extends InputStream {
        private final RandomAccessFile file;
        private long remaining;
        Slice(File path, long offset, long length) throws IOException {
            file = new RandomAccessFile(path, "r");
            try { file.seek(offset); remaining = length; }
            catch (IOException e) { file.close(); throw e; }
        }
        @Override public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = file.read();
            if (value != -1) remaining--; else remaining = 0;
            return value;
        }
        @Override public int read(byte[] buffer, int offset, int length) throws IOException {
            if (length == 0) return 0;
            if (remaining <= 0) return -1;
            int count = file.read(buffer, offset, (int)Math.min(length, remaining));
            if (count > 0) remaining -= count; else if (count == -1) remaining = 0;
            return count;
        }
        @Override public int available() { return (int)Math.min(remaining, Integer.MAX_VALUE); }
        @Override public void close() throws IOException { file.close(); }
    }
}

