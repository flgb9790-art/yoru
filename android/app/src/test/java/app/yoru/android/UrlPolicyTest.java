package app.yoru.android;
import org.junit.Test;import static org.junit.Assert.*;
public class UrlPolicyTest {
 @Test public void notificationPathsStayOnYoru(){for(String path:new String[]{"/messages/user","/anime/id?episode=4#player","/catalog?q=%D0%B0"})assertEquals(path,UrlPolicy.safePath(path));}
 @Test public void rejectExternalAndMalformedNotificationLinks(){for(String path:new String[]{"https://evil.test","//evil.test/a","javascript:alert(1)","/\\evil.test","/hello\nworld","/\u0000","/bad space","///evil.test"})assertEquals("/",UrlPolicy.safePath(path));assertEquals("/",UrlPolicy.safePath(null));}
}
