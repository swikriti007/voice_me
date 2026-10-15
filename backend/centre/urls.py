from django.contrib.auth import views as auth_views
from django.urls import path

from . import views

app_name = 'centre'

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('login/', auth_views.LoginView.as_view(
        template_name='centre/login.html', authentication_form=views.StaffAuthenticationForm,
        redirect_authenticated_user=True,
    ), name='login'),
    path('logout/', auth_views.LogoutView.as_view(next_page='centre:login'), name='logout'),
    path('accounts/new/', views.create_account, name='create-account'),
    path('accounts/<str:user_id>/password/', views.set_password, name='set-password'),
    path('accounts/<str:user_id>/delete/', views.delete_account, name='delete-account'),
    path('devices/pair/', views.pair_sos_device, name='pair-device'),
]
