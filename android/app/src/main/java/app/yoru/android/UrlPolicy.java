package app.yoru.android;
import java.net.URI;import java.net.URISyntaxException;
public final class UrlPolicy {
 private UrlPolicy(){}
 public static String safePath(String value){if(value==null||!value.startsWith("/")||value.startsWith("//")||value.indexOf('\\')>=0)return "/";for(int i=0;i<value.length();i++)if(value.charAt(i)<32||value.charAt(i)==127)return "/";try{URI uri=new URI(value);return uri.getScheme()==null&&uri.getRawAuthority()==null?value:"/";}catch(URISyntaxException e){return "/";}}
}
