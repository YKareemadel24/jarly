/// go_router configuration mirroring the Expo Router tree: a 4-branch shell
/// plus pushed jar and transfer routes, with the `?action=deposit` deep-link
/// convention preserved.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'screens/home_screen.dart';
import 'screens/jar_detail_screen.dart';
import 'screens/new_jar_screen.dart';
import 'screens/placeholder_screen.dart';
import 'screens/tab_shell.dart';
import 'screens/transfer_hub_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => TabShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
                path: '/activity',
                builder: (context, state) =>
                    const PlaceholderScreen(title: 'Activity')),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
                path: '/stats',
                builder: (context, state) =>
                    const PlaceholderScreen(title: 'Insights')),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
                path: '/profile',
                builder: (context, state) =>
                    const PlaceholderScreen(title: 'Profile')),
          ]),
        ],
      ),
      GoRoute(
        path: '/jar/new',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const NewJarScreen(),
          transitionsBuilder: _slideFromBottom,
        ),
      ),
      GoRoute(
        path: '/jar/:id',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: JarDetailScreen(
            jarId: state.pathParameters['id']!,
            autoDeposit: state.uri.queryParameters['action'] == 'deposit',
          ),
          transitionsBuilder: _slideFromRight,
        ),
      ),
      GoRoute(
        path: '/transfer',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const TransferHubScreen(),
          transitionsBuilder: _slideFromRight,
        ),
      ),
    ],
  );
});

Widget _slideFromRight(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child) {
  final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
  return SlideTransition(
    position: Tween<Offset>(begin: const Offset(0.06, 0), end: Offset.zero)
        .animate(curved),
    child: FadeTransition(
      opacity: Tween<double>(begin: 0.4, end: 1).animate(curved),
      child: child,
    ),
  );
}

Widget _slideFromBottom(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child) {
  final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
  return SlideTransition(
    position: Tween<Offset>(begin: const Offset(0, 0.04), end: Offset.zero)
        .animate(curved),
    child: FadeTransition(
      opacity: Tween<double>(begin: 0.4, end: 1).animate(curved),
      child: child,
    ),
  );
}
