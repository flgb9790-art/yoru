package app.yoru.android;
import android.app.*;
import com.google.firebase.*;
import com.google.firebase.messaging.FirebaseMessaging;
public class YoruApplication extends Application {
 public void onCreate(){super.onCreate();NotificationManager manager=getSystemService(NotificationManager.class);NotificationChannel messages=new NotificationChannel("yoru_messages","Сообщения",NotificationManager.IMPORTANCE_HIGH);messages.setDescription("Личные сообщения в YORU");messages.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);NotificationChannel episodes=new NotificationChannel("yoru_episodes","Новые серии",NotificationManager.IMPORTANCE_DEFAULT);episodes.setDescription("Серии отслеживаемых аниме");episodes.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);manager.createNotificationChannel(messages);manager.createNotificationChannel(episodes);
 if(!BuildConfig.FIREBASE_APP_ID.isEmpty()){FirebaseOptions options=new FirebaseOptions.Builder().setApplicationId(BuildConfig.FIREBASE_APP_ID).setProjectId(BuildConfig.FIREBASE_PROJECT_ID).setApiKey(BuildConfig.FIREBASE_API_KEY).setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID).build();FirebaseApp.initializeApp(this,options);FirebaseMessaging.getInstance().setAutoInitEnabled(!getSharedPreferences("yoru",MODE_PRIVATE).getString("account","").isEmpty());}
 }
}
