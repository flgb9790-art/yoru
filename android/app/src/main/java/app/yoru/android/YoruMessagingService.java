package app.yoru.android;
import android.Manifest;import android.app.*;import android.content.*;import android.content.pm.PackageManager;import android.os.Build;
import com.google.firebase.messaging.*;
public class YoruMessagingService extends FirebaseMessagingService {
 @Override public void onNewToken(String token){getSharedPreferences("yoru",MODE_PRIVATE).edit().putString("token",token).apply();PushRegistrationService.schedule(this);sendBroadcast(new Intent(getPackageName()+".TOKEN").setPackage(getPackageName()));}
 @Override public void onMessageReceived(RemoteMessage message){String account=message.getData().get("account_id");if(account==null||!account.equals(getSharedPreferences("yoru",MODE_PRIVATE).getString("account","")))return;
 if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
 String href=MainActivity.safePath(message.getData().get("href")),key=message.getData().getOrDefault("event_id",message.getMessageId());if(key==null)key=String.valueOf(System.currentTimeMillis());String title=message.getData().getOrDefault("title","YORU"),body=message.getData().getOrDefault("body","Новое уведомление");
 Intent intent=new Intent(this,MainActivity.class).putExtra("href",href).putExtra("account_id",account).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);PendingIntent pending=PendingIntent.getActivity(this,key.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
 Notification notification=new Notification.Builder(this,"episode".equals(message.getData().get("kind"))?"yoru_episodes":"yoru_messages").setSmallIcon(app.yoru.android.R.drawable.ic_notification).setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(pending).build();getSystemService(NotificationManager.class).notify(key,0,notification);
 }
}
